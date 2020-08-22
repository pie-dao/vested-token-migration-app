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
        // The max amount claimable is the amount not subject to vesting, _amount or the input token balance whatever is less.
        // TODO refactor this massive oneliner into something more readeable
        uint256 amountClaimable = _amount.min256(nonVestedAmounts[msg.sender]).min256(ERC20(inputTokenManager.token()).balanceOf(msg.sender));
        require(amountClaimable >= _amount, "CLAIM_AMOUNT_TOO_LARGE");

        // Decrease non vested amount
        nonVestedAmounts[msg.sender] = nonVestedAmounts[msg.sender].sub(_amount);

        // Burn input token
        inputTokenManager.burn(msg.sender, _amount);
        
        // Mint tokens to msg.sender
        outputTokenManager.mint(msg.sender, _amount);

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
        // See "Migrating vested token, vesting already expired" for the case that needs this line
        migrateAmount = migrateAmount.min256(_windowAmount);
        amountMigratedFromWindow[leaf] = amountMigratedFromWindow[leaf].add(migrateAmount);

        // Burn input token
        inputTokenManager.burn(msg.sender, migrateAmount);
        
        // Mint tokens to receiver
        outputTokenManager.mint(_receiver, migrateAmount);

        return migrateAmount;
    }

    function _calcVestedAmount(uint256 _amount, uint256 _time, uint256 _start, uint256 _vested) internal returns(uint256) {
        //_time.sub(_start) throws MATH_SUB_UNDERFLOW @ Migrating vested token, vesting is upcoming
        //_vested.sub(_start) throws MATH_SUB_UNDERFLOW @ Wrong vesting period
        //WARNING if _time == _start or _vested == _start, it will dividive with zero
        return _amount.mul(_time.sub(_start)) / _vested.sub(_start);
    }

}