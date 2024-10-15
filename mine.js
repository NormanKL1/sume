import { SuiMaster } from 'suidouble';
import config from './config.js';
import Miner from './includes/Miner.js';
import FomoMiner from './includes/fomo/FomoMiner.js';
import Welcome from './includes/ascii/Welcome.js';

const run = async()=>{
    const phrase = config.phrase;
    const chain = config.chain;

    if (!config.phrase || !config.chain) {
        throw new Error('phrase and chain parameters are required');
    }
    
    console.log('sui_meta_miner version: ', config.version);

    if (!SuiMaster.SuiUtils) {
        console.log('npm libraries outdated, please run "npm upgrade" first');
        return false;
    }

    const suiMasterParams = {
        client: chain,
        debug: !!config.debug,
    };

    if (config.rpc && config.rpc.url) {
        const rpcParams = {
            chain: config.chain,
            url: config.rpc.url,
        };
        if (config.rpc.headers) {
            rpcParams.rpc = { headers: config.rpc.headers };
        }
        const rpcClient = SuiMaster.SuiUtils.suiClientForRPC(rpcParams);
        suiMasterParams.client = rpcClient;

        console.log('using custom RPC with URL of', config.rpc.url);
    }

    if (phrase.indexOf('suiprivkey') === 0) {
        suiMasterParams.privateKey = phrase;
    } else {
        suiMasterParams.phrase = phrase;
    }
    const suiMaster = new SuiMaster(suiMasterParams);
    await suiMaster.initialize();

    console.log('suiMaster connected as ', suiMaster.address);

    const miners = {};

    const doMine = async(minerInstance)=>{
        while (true) {
            try {
                if (config.combined && minerInstance.mineCombined) {
                    await minerInstance.mineCombined(config.combined);
                } else {
                    await minerInstance.mine();
                }
            } catch (e) {
                console.error(e);
                console.log('restarting the miner instance...');
            }
            await new Promise((res)=>setTimeout(res, 100));
        };
    };


    if (config.do.meta) {
        const miner = new Miner({
            suiMaster,
            packageId: config.packageId,
            blockStoreId: config.blockStoreId,
            treasuryId: config.treasuryId,
            workersCount: config.workersCount,
        });
        miners.meta = miner;
        Welcome.meta();
        doMine(miners.meta);
    };
    if (config.do.fomo) {
        const fomoMiner = new FomoMiner({
            suiMaster,
            packageId: config.fomo.packageId,
            configId: config.fomo.configId,
            buses: config.fomo.buses,
            workersCount: config.workersCount,
        });    
        miners.fomo = fomoMiner;
        Welcome.fomo();
        doMine(miners.fomo);
    };

};

run()
    .then(()=>{
        console.error('running');
    });