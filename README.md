## CLI Miner for META and FOMO PoW on the Sui Blockchain

- [Meta](https://github.com/suidouble/sui_meta) is the PoW coin on the Sui blockchain
- [Web Miner](https://suimine.xyz/) for the FOMO token
- [Follow me on X](https://x.com/suidouble)
- Exchanges:
- [Buy META](https://hop.ag/swap/SUI-0x3c680197c3d3c3437f78a962f4be294596c5ebea6cea6764284319d5e832e8e4%3A%3Ameta%3A%3AMETA)
- [Buy FOMO](https://hop.ag/swap/SUI-0xa340e3db1332c21f20f5c08bef0fa459e733575f9a7e2f5faca64f72cd5a54f2%3A%3Afomo%3A%3AFOMO)
- CLI Miner:

CLI miner expects you to have node.js installed of version >= 18 [node.js](https://nodejs.org/en/download/package-manager)

```
git clone https://gitlab.com/suidouble/sui_meta.git 
cd sui_meta
npm install
```
#### Upgrade miner version

```
git pull
npm upgrade
```

#### Run it

Miner supports both META and FOMO coins:

```
node mine.js --meta --chain=mainnet --phrase="secretphrase"
node mine.js --fomo --chain=mainnet --phrase="secretphrase"
```

or you can run it in the boss mode, mining both:

```
node mine.js --fomo --meta --chain=mainnet --phrase="secretphrase"

```

Where secretphrase is 24 words secret phrase for your wallet private key or private key in the format of "suiprivkey1....." ( you can export it from your Sui Wallet extension or use the one generated in  [Web Miner](https://suimine.xyz/) )

#### Please never share or disclose your secret phrase or private key. !!

Be sure you have some SUI in your wallet for the gas, 1 SUI is enough for submiting many hashes.

#### Combined mining of FOMO

If your goal is to reduce gas fees and increase mining profits, you can try combined mining. This approach creates multiple instances of the Miner object and processes several hashes in a single transaction, combining the results efficiently.

As an added bonus, it automatically merges FOMO coins on the fly, eliminating the need for you to manually merge them later

```
node mine.js --fomo --chain=mainnet --phrase="secretphrase" --combined=8
```

#### Merge META or FOMO coins

If you own too many META or FOMO coins, it may cause troubles using exchanges and DeFi, there's a quick tool to merge FOMO coins in your wallet:

```
node merge.js --meta --chain=mainnet --phrase="secretphrase"
node merge.js --fomo --chain=mainnet --phrase="secretphrase"
```

It merges up to 500 coin objects into single one. But you can run it few times, until it merges every META or FOMO you have.


#### Threads/CPU count

The miner attempts to utilize all available system resources. You can adjust the number of CPU threads it uses by modifying the workersCount setting in the `config.js` file. Change the value from `auto` to a specific number, such as `8`, `24`, or any other desired amount.

#### Set custom RPC

If you experience frequent timeouts with the public Sui RPC, you can try using a custom RPC. Simply add the configuration in the `config.js` file. Uncomment the one there and adjust:

```javascript
"rpc": {
    url: 'https://sui-mainnet.g.allthatnode.com/full/json_rpc',
    headers: {
        "x-allthatnode-api-key": "xxxxxxxxxxxxxx",
    },
},
```

Please note that mining is a resource-intensive process. If you are using a premium RPC service, make sure to monitor your RPC usage with your provider dashboard.

#### Development fee

FOMO Miner contributes 1% of the hashes to the developer as a small way to support my work.

## License

Apache

**Please open-source your fork**
