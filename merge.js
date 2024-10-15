import { SuiMaster } from 'suidouble';
import config from './config.js';
import Merger from './includes/merger/Merger.js';

const run = async()=>{
    const phrase = config.phrase;
    const chain = config.chain;

    if (!config.phrase || !config.chain) {
        throw new Error('phrase and chain parameters are required');
    }

    console.log('sui_meta_miner version: ', config.version);

    const suiMasterParams = {
        client: chain,
        debug: !!config.debug,
    };
    if (phrase.indexOf('suiprivkey') === 0) {
        suiMasterParams.privateKey = phrase;
    } else {
        suiMasterParams.phrase = phrase;
    }
    const suiMaster = new SuiMaster(suiMasterParams);
    await suiMaster.initialize();

    console.log('suiMaster connected as ', suiMaster.address);

    if (config.do.fomo) {
        const fomoMerger = new Merger({
            suiMaster,
        });    
        await fomoMerger.mergeTokens(config.fomo.coinType);
    };
    if (config.do.meta) {
        const fomoMerger = new Merger({
            suiMaster,
        });    
        await fomoMerger.mergeTokens(config.coinType);
    };

};

run()
    .then(()=>{
        console.error('');
    });