# Vested Token Migration

The vested token migration Aragon app allows you to migrate one Aragon MiniMe Token into another. Migrations are subject to vesting, a Merkle root determines which vesting shedules are considered valid.

The App exposes the following functions:

- ``function setVestingWindowMerkleRoot(bytes32 _root)`` Allows a permitted address with the `SET_VESTING_WINDOW_MERKLE_ROOT_ROLE` to set the root of the vesting windows Merkle Tree
- `function migrateVested(
        address _receiver,
        uint256 _amount,
        uint256 _windowAmount,
        uint256 _windowVestingStart,
        uint256 _windowVestingEnd,
        bytes32[] _proof)
    ` Allows anyone with a valid vesting window to migrate their tokens
-  ``function calcVestedAmount(uint256 _amount, uint256 _time, uint256 _vestingStart, uint256 _vestingEnd) public view returns(uint256)`` Utility function to calculate the amount vested


## Requirements

We require the following dependencies to be installed on your machine

- node tested with 12.18.3
- yarn tested with 1.22.4
- frame tested with 0.3.1 (currently broken on Windows 10)

## Get started developing

Run the following commands to get started.
```
yarn
yarn build
yarn test
yarn coverage
```

## Generating vesting windows

```
npx buidler generate-mints-json --token 0x5f5e9ed11344dadc3a08688e5f17e23f6a99bf81 --network mainnet
npx buidler generate-windows-json  --vesting0-duration 94608000 --vesting0-till 1583178715 --vesting1-duration 47304000 --vesting1-till 1587290630 --vesting2-duration 31536000 --vesting2-till 9999999999
## log merkle root
npx buidler generate-proof
```

## Minting testnet tokens

```
npx buidler mint-tokens --tokenManager [manager address] --network [network]
```

## Setting vesting window window merkle root on the app

```
dao exec <dao-address> <migration-app-address> setVestingWindowMerkleRoot <bytes32 merkle root> --environment aragon:rinkeby --use-frame
```
