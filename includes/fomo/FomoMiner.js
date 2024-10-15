
import suidouble from 'suidouble';
import { bcs } from '@mysten/sui/bcs';
import hasher from 'js-sha3';
// import { spawn, Thread, Worker } from "threads";

import { bytesTou64, bigIntTo32Bytes, u64toBytes } from '../math.js';
import NonceFinder from '../NonceFinder.js';

export default class FomoMiner {
    constructor(params = {}) {
        this._suiMaster = params.suiMaster || null;

        this._buses = params.buses || null;
        this._configId = params.configId || null;
        this._packageId = params.packageId || null;

        // this._blockStore = null; // to be initialized as SuiObject in .checkObjects() initializer
        // this._treasury = null;
        // this._movePackage = null;

        this._nonceFinder = new NonceFinder({ 
            workersCount: params.workersCount || 8,
            name: 'FOMO' 
        });

        this._config = null;
        this._movePackage = null;
    }

    async checkObjects() {
        if (this.__checkObjectsPromise) {
            return await this.__checkObjectsPromise;
        }

        this.__checkObjectsPromiseResolver = null; // to be sure it's executed once async
        this.__checkObjectsPromise = new Promise((res)=>{ this.__checkObjectsPromiseResolver = res; });

        if (!this._configId || !this._packageId || !this._buses) {
            throw new Error('FOMO | configId, packageId are required');
        }

        const SuiObject = suidouble.SuiObject;
        
        const config = new SuiObject({
            id: this._configId,
            suiMaster: this._suiMaster,
        });
        // const treasury = new SuiObject({
        //     id: this._treasuryId,
        //     suiMaster: this._suiMaster,
        // });
        this._suiMaster.objectStorage.push(config);
        // this._suiMaster.objectStorage.push(treasury);

        await config.fetchFields(); // get fields from the blockchain

        this._config = config;
        // this._treasury = treasury;

        const movePackage = this._suiMaster.addPackage({
            id: this._packageId,
        });
        await movePackage.isOnChain(); // check the package on the blockchain

        this._movePackage = movePackage;


        this._coinObjectId = null;

        let result = await this._suiMaster.client.getCoins({
                owner: this._suiMaster.address,
                coinType: '0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2::fomo::FOMO',
                limit: 1,
                cursor: null,
            });
        if (result && result.data && result.data[0]) {
            this._coinObjectId = result.data[0].coinObjectId;
        }

        this.__checkObjectsPromiseResolver(true); // initialized

        return true;
    }

    async getOrCreateMiner() {
        await this.checkObjects();

        // check for owned objects
        if (this._suiMaster._debug) {
            console.log('FOMO | Trying to find the miner object already registered on the blockchain....');
        }
        const paginated = await this._movePackage.modules.miner.getOwnedObjects({ typeName: 'Miner' });
        let miner = null;
        await paginated.forEach((suiObject)=>{ miner = suiObject; });

        if (miner) {
            if (this._suiMaster._debug) {
                console.log('FOMO | It is there, id is: ', miner.id);
            }
            return miner;
        }

        console.log('FOMO | Can not find it. Lets register the new one...');

        await this._movePackage.modules.miner.moveCall('register', []);

        console.log('FOMO | Miner succesfully registered');
        await new Promise((res)=>{ setTimeout(res, 2000); });

        return await this.getOrCreateMiner();
    }

    async fetchBus() {
        await this.checkObjects();
        const randomBusId = this._buses[Math.floor(Math.random() * this._buses.length)];

        // console.log(randomBusId);

        const bus = new (this._suiMaster.SuiObject)({ id: randomBusId, suiMaster: this._suiMaster });
        await bus.fetchFields();

        return bus;
    }

    async hasBlockInfoChanged(oldHash) {
        const miner = await this.getOrCreateMiner();
        const newHash = new Uint8Array(miner.fields.current_hash); // changed on the new block

        // console.log('Current hash: '+newHash);
        if (bytesTou64(oldHash) != bytesTou64(newHash)) {
            return true;
        }
        return false;
    }

    async getOrCreateMinerWithNewerVersion(oldVersion, timeout) {
        let miner = await this.getOrCreateMiner();
        if (!oldVersion) {
            return miner;
        }

        let startCheckingAt = (new Date()).getTime();
        while (miner.version == oldVersion) {
            console.log('FOMO | Waiting for the miner hash with updated version...');

            await new Promise((res)=>setTimeout(res, 1000));
            miner = await this.getOrCreateMiner();
            
            if ((new Date()).getTime() - startCheckingAt > timeout) {
                console.log('FOMO | Using the current miner hash');
                return miner;
            }
        };

        return miner;
    }

    async mine(startNonce = 0) {
        await this.checkObjects();

        let bus = await this.fetchBus();
        while (!this.busIsOk(bus)) {
            console.log('FOMO | Bus is not ready to pay rewards, waiting for FOMO epoch reset...');
            await this.waitUntilNextReset(bus);
            bus = await this.fetchBus();
        }

        let miner = await this.getOrCreateMinerWithNewerVersion(this.__lastMinerObjectVersion, 5000);

        const currentHash = new Uint8Array(miner.fields.current_hash); // changed on the new block
        const signerAddressBytes = bcs.Address.serialize(this._suiMaster.address).toBytes();
        const difficulty = Number(bus.fields.difficulty);
        const difficultyAsTarget = '0x'+(''.padEnd(difficulty*2, '00').padEnd(64, 'ff'));

        let foundValid = false;
        let preparedHash = this.prepareHash(currentHash, signerAddressBytes);
        let nonce = startNonce || 0;
        const startFindingNonceAt = (new Date()).getTime();

        let isOutdated = false;
        const __checkForOutdatedInterval = setInterval(()=>{
            try {
                this.hasBlockInfoChanged(currentHash)
                    .then((changed)=>{
                        console.log('FOMO | block hash changed', changed);
                        if (changed) {
                            isOutdated = true;
                            this._nonceFinder.pleaseStop();
                        }
                    })
                    .catch((e)=>{
                        console.error(e);
                    });
            } catch (e) {
                console.log(e);
            }
        }, 3000);

        try {

            while (!foundValid && !isOutdated) {
                nonce = await this._nonceFinder.findValidNonce(preparedHash, difficultyAsTarget);
    
                if (nonce !== null) {
                    console.log('FOMO | valid nonce '+nonce+' found in '+((new Date()).getTime() - startFindingNonceAt)+'ms');
                    const success = await this.submit(nonce, bus, miner);
                    this.__lastMinerObjectVersion = miner.version;
                    if (success) {
                        foundValid = true;
                    } else {
                        console.log('FOMO | blockInfo was wrong!!!');
                        nonce = nonce + 1;
    
                        miner = await this.getOrCreateMiner();
                        preparedHash = this.prepareHash(new Uint8Array(miner.fields.current_hash), signerAddressBytes);
                    }
                } else {
                    // asked to stop 
                    isOutdated = true;
                }
    
            };

        } catch(e) {
            console.error(e);
        }

        clearInterval(__checkForOutdatedInterval);

        return true;
    }


    busIsOk(bus) {
        const epochLength = 60000;
        const fundsOk = BigInt(bus.fields.rewards) >= BigInt(bus.fields.reward_rate);
        const threshold = Number(bus.fields.last_reset) + epochLength;

        const buffer = 4000;
        const resetTimeOk = Date.now() < threshold - buffer;

        return resetTimeOk && fundsOk;
    }

    async getMinersOfCount(count = 7) {
        await this.checkObjects();

        console.log('FOMO | Getting Miner objects of count: ', count);
        const paginated = await this._movePackage.modules.miner.getOwnedObjects({ typeName: 'Miner' });
        const miners = [];
        await paginated.forEach((suiObject)=>{ if (miners.length < count) { miners.push(suiObject); } });

        if (miners.length < count) {
            console.log('FOMO | Got ', miners.length, ', adding another');
            await this._movePackage.modules.miner.moveCall('register', []);
            return await this.getMinersOfCount(count);
        }

        return miners;
    }

    async buses() {
        await this.checkObjects();

        if (this.__allBuses) {
            return this.__allBuses;
        }

        const buses = [];
        const busesIds = {};

        console.log('FOMO | Getting all buses....');
        let i = 0;
        do {
            const busId = this._buses[i];
            const bus = new (this._suiMaster.SuiObject)({ id: busId, suiMaster: this._suiMaster });
            await bus.fetchFields();

            if (!busesIds[bus.id]) {
                busesIds[bus.id] = bus.id;
                buses.push(bus);
            }
            i++;
        } while (buses.length < this._buses.length);

        this.__allBuses = buses;

        return buses;
    }


    async mineCombined(count = 7) {
        const tx = new suidouble.Transaction();
        const miners = await this.getMinersOfCount(count);

        let buses = await this.buses();

        let cur = 0;
        let moveResults = [];
        let firstMoveResult = null;

        const busInputs = {};

        const bus = buses[Math.floor(Math.random() * buses.length)];

        for (const miner of miners) {
            // const bus = buses[cur % this._buses.length];
            console.log('FOMO | Getting hash for miner #', (cur + 1), '/', count);

            cur++;

            const currentHash = new Uint8Array(miner.fields.current_hash); // changed on the new block
            const signerAddressBytes = bcs.Address.serialize(this._suiMaster.address).toBytes();
            const difficulty = Number(bus.fields.difficulty);
            const difficultyAsTarget = '0x'+(''.padEnd(difficulty*2, '00').padEnd(64, 'ff'));
    
            let preparedHash = this.prepareHash(currentHash, signerAddressBytes);
            const nonce = await this._nonceFinder.findValidNonce(preparedHash, difficultyAsTarget);

            const clockInput = tx.object('0x0000000000000000000000000000000000000000000000000000000000000006');// clock

            let busInput = null;
            if (busInputs[bus.id]) {
                busInput = busInputs[bus.id];
            } else {
                busInput = tx.object(bus.id);
                busInputs[bus.id] = busInput;
            }

            const args = [
                tx.pure('u64', nonce),
                busInput, // bus
                tx.object(miner.id), // miner
                clockInput,
            ];
            const moveCallResult = tx.moveCall({
                target: `${this._packageId}::fomo::mine`,
                arguments: args
            });

            const devAddress = '0x263689e77331de0e47f8a9668c7550f391c10c3c7afe44659dcac00203529f78';
            const chancesToSupportDev = 0.01;
    
            if (devAddress && (Math.random() <= chancesToSupportDev )) {
                tx.transferObjects([moveCallResult], devAddress);
            } else {
                moveResults.push(moveCallResult);
            }
            
        }

        if (this._coinObjectId && moveResults.length) {
            tx.mergeCoins(tx.object(this._coinObjectId), moveResults);
        } else {
            tx.transferObjects(moveResults, this._suiMaster.address);
        }

        console.log('FOMO | All hashes found');

        let maxTries = 3;
        let curTry = 0;

        while (curTry < maxTries) {
            try {
                const r = await this._suiMaster.signAndExecuteTransaction({ 
                    transaction: tx, 
                    requestType: 'WaitForLocalExecution',
                    sender: this._suiMaster.address, 
                    options: {
                        "showEffects": true,
                    },
                });
        
                if (r && r.effects && r.effects.status && r.effects.status.status && r.effects.status.status == 'success') {
                    console.log('FOMO | valid nonce submited');
                    return true;
                } else {
                    console.log('FOMO | can not submit nonce');
                }
            } catch (e) {
                console.log('FOMO | can not submit nonce');
                this.__allBuses = null;
                console.error((''+e).split("\n")[0]);
            }

            curTry++;

            if (curTry < maxTries) {
                await this.waitUntilNextReset();
            }
        }


        return false;
    }


    async submit(nonce, bus, miner) {
        const tx = new suidouble.Transaction();

        const args = [
            tx.pure('u64', nonce),
            tx.object(bus.id), // bus
            tx.object(miner.id), // miner
            tx.object('0x0000000000000000000000000000000000000000000000000000000000000006'), // clock
            // tx.object(this._treasury.id),
            // suidouble.txInput(tx, 'vector<u8>', Array.from(meta)),
            // suidouble.txInput(tx, 'vector<u8>', Array.from(payload)),
            // suidouble.txInput(tx, 'u64', nonce),
            // tx.object(this._suiMaster.address),
        ];

        const moveCallResult = tx.moveCall({
            target: `${this._packageId}::fomo::mine`,
            arguments: args
        });

        const devAddress = '0x263689e77331de0e47f8a9668c7550f391c10c3c7afe44659dcac00203529f78';
        const chancesToSupportDev = 0.01;

        if (devAddress && (Math.random() <= chancesToSupportDev )) {
            tx.transferObjects([moveCallResult], devAddress);
        } else {
            tx.transferObjects([moveCallResult], this._suiMaster.address);
        }

        try {
            const r = await this._suiMaster.signAndExecuteTransaction({ 
                transaction: tx, 
                // requestType: 'WaitForLocalExecution',
                sender: this._suiMaster.address, 
                options: {
                    "showEffects": true, // @todo: remove?
                    // "showEvents": true, // @todo: remove?
                    // "showObjectChanges": true,
                    // showType: true,
                    // showContent: true,
                    // showOwner: true,
                    // showDisplay: true,
                },
            });
    
            if (r && r.effects && r.effects.status && r.effects.status.status && r.effects.status.status == 'success') {
                console.log('FOMO | valid nonce submited');
                return true;
            } else {
                console.log('FOMO | can not submit nonce');
            }
        } catch (e) {
            console.log('FOMO | can not submit nonce');
            console.error((''+e).split("\n")[0]);
        }

        return false;
    }

    async waitUntilNextReset(currentBus) {
        const epochLength = 60000;

        if (!currentBus) {
            currentBus = await this.fetchBus();
        }

        // const bus = await this.fetchBus();
        const currentReset = Number(currentBus.fields.last_reset);
        const nextReset = currentReset + epochLength;
        const timeUntilNextReset = nextReset - Date.now();

        console.log('FOMO | waiting for the epoch reset');

        if (timeUntilNextReset > 0) {
            await new Promise((res)=>setTimeout(res, timeUntilNextReset));
        }

        while (true) {
            const freshBus = await this.fetchBus();
            if (Number(freshBus.fields.last_reset) !== Number(currentReset)) {
                return true;
            } else {
                if (Date.now() > nextReset + 12000) {
                    return false;
                }
                await new Promise((res)=>setTimeout(res, 1500));
            }
        }
    }

    prepareHash(currentHash, signerAddressBytes) {
        const prepared = new Uint8Array(32 + 32); // nonce bytes would be empty
        prepared.set(currentHash, 0);
        prepared.set(signerAddressBytes, 32);

        return prepared;
    }

    createHash(currentHash, signerAddressBytes, nonce) {
        const dataToHash = new Uint8Array(32 + 32 + 8);
        dataToHash.set(currentHash, 0);
        dataToHash.set(signerAddressBytes, 32);
        dataToHash.set(u64toBytes(nonce), 64);

        return bigIntTo32Bytes(BigInt('0x'+hasher.keccak256(dataToHash)));
    }

    validateHash(hash, difficulty) {
        return hash.slice(0, difficulty).reduce((a, b) => a + b, 0) === 0;
    }



}