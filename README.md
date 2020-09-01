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
-  ``function calcVestedAmount(uint256 _amount, uint256 _time, uint256 _vestingStart, uint256 _vestingEnd) public view returns(uint256)`` Utility function to calculate the amount vested.


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