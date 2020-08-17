pragma solidity 0.4.24;

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/Math.sol";
import "@aragon/os/contracts/apps/AragonApp.sol";

import "./interfaces/ITokenManager.sol";
import "./libraries/MerkleProof.sol";

contract VestedTokenMigration is AragonApp {
    using SafeMath for uint256;
    using Math for uint256;

    bytes32 public constant INCREASE_NON_VESTED_ROLE = keccak256("INCREASE_NON_VESTED_ROLE");
    bytes32 public constant SET_VESTING_WINDOW_MERKLE_ROOT_ROLE = keccak256("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE");


    ITokenManager public inputTokenManager;
    ITokenManager public outputTokenManager;
    
    // Mapping address to amounts which are excluded from vesting
    mapping(address => uint256) public nonVestedAmounts;
    mapping(bytes32 => uint256) public amountMigratedFromWindow; 
    bytes32 public vestingWindowsMerkleRoot;

    function initialize(address _inputTokenManager, address _outputTokenManager) external onlyInit {
        inputTokenManager = ITokenManager(_inputTokenManager);
        outputTokenManager = ITokenManager(_outputTokenManager);
        initialized();
    }


    // PRIVILIGED FUNCTIONS ----------------------------------------------

    function increaseNonVested(address _holder, uint256 _amount) external auth(INCREASE_NON_VESTED_ROLE) {
        nonVestedAmounts[_holder] = nonVestedAmounts[_holder].add(_amount);
    }

    function setVestingWindowMerkleRoot(bytes32 _root) external auth(SET_VESTING_WINDOW_MERKLE_ROOT_ROLE) {
        vestingWindowsMerkleRoot = _root;
    }

    // MIGRATION FUNCTIONS -----------------------------------------------

    function migrateNonVested(uint256 _amount) external returns(uint256) {
        // Migrate _amount or amount which is non vested whatever is less
        uint256 amountClaimable = _amount.min256(nonVestedAmounts[msg.sender]);

         // Decrease non vested amount
        nonVestedAmounts[msg.sender] = nonVestedAmounts[msg.sender].sub(amountClaimable);

        // Burn input token
        inputTokenManager.burn(msg.sender, amountClaimable);
        
        // Mint tokens to msg.sender
        outputTokenManager.mint(msg.sender, amountClaimable);

        return amountClaimable;
    }

    function migrateVested(
        address _receiver,
        uint256 _amount,
        uint256 _windowAmount,
        uint256 _windowStart,
        uint256 _windowVested,
        bytes32[] _proof
    ) external returns(uint256) {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _windowAmount, _windowStart, _windowVested));
        require(MerkleProof.verify(_proof, vestingWindowsMerkleRoot, leaf), "MERKLE_PROOF_FAILED");

        // Migrate at max what is already vested and not already migrated
        uint256 migrateAmount = _amount.min256(_calcVestedAmount(_windowAmount, block.timestamp, _windowStart, _windowVested).sub(amountMigratedFromWindow[leaf]));
        amountMigratedFromWindow[leaf] = amountMigratedFromWindow[leaf].add(migrateAmount);

        // Burn input token
        inputTokenManager.burn(msg.sender, migrateAmount);
        
        // Mint tokens to receiver
        // outputTokenManager.mint(_receiver, migrateAmount);

        return migrateAmount;
    }

    function _calcVestedAmount(uint256 _amount, uint256 _time, uint256 _start, uint256 _vested) internal returns(uint256) {
        return _amount.mul(_time.sub(_start)) / _vested.sub(_start);
    }

}