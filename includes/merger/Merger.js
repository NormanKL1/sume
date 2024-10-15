
import suidouble from 'suidouble';

export default class FomoMiner {
    constructor(params = {}) {
        this._suiMaster = params.suiMaster || null;
    }

    async mergeTokens(coinType) {
        console.log('MERGER | finding '+coinType+' coins you own...');

        const coinIds = [];
        const coins = [];

        let result = null;
        let cursor = null;
        do {
            result = await this._suiMaster.client.getCoins({
                owner: this._suiMaster.address,
                coinType: coinType,
                limit: 50,
                cursor: cursor,
            });

            coins.push(...result.data);

            cursor = result.nextCursor;
        } while (result.hasNextPage && coins.length < 500);

        // coins.sort((a, b) => {
        //     // From big to small
        //     return Number(b.balance) - Number(a.balance);
        // });
        let mergeInId = null;
        const toMergeIds = [];

        for (const coin of coins) {
            coinIds.push(coin.coinObjectId);
            if (!mergeInId) {
                mergeInId = coin.coinObjectId;
            } else {
                toMergeIds.push(coin.coinObjectId);
            }
        }

        if (coinIds.length < 2) {
            console.log('MERGER | too few coin objects already');
            return true;
        }  else {
            console.log('MERGER | going to merge '+toMergeIds.length+' coin objects into '+mergeInId);
        }

        const tx = new suidouble.Transaction();
        tx.mergeCoins(tx.object(mergeInId), toMergeIds);

        try {
            const r = await this._suiMaster.signAndExecuteTransaction({ 
                transaction: tx, 
                // requestType: 'WaitForLocalExecution',
                sender: this._suiMaster.address, 
                options: {
                    "showEffects": true, // @todo: remove?
                },
            });
    
            if (r && r.effects && r.effects.status && r.effects.status.status && r.effects.status.status == 'success') {
                console.log('MERGER | merged sucessfully');
                return true;
            } else {
                console.log('MERGER | no luck merging. You still own your coins, try web merger maybe?');
            }
        } catch (e) {
            console.error(e);
            console.log('MERGER | no luck merging. You still own your coins, try web merger maybe?');
        }

    }



}