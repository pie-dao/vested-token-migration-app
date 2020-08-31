pragma solidity 0.4.24;

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/Math.sol";
import "@aragon/os/contracts/apps/AragonApp.sol";

import "./interfaces/ITokenManager.sol";
import "./libraries/MerkleProof.sol";

contract VestedTokenMigration is AragonApp {
    using SafeMath for uint256;
    using Math for uint256;

    bytes32 public constant INCREASE_UNLOCKED_ROLE = keccak256("INCREASE_UNLOCKED_ROLE");
    bytes32 public constant SET_VESTING_WINDOW_MERKLE_ROOT_ROLE = keccak256("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE");


    ITokenManager public inputTokenManager;
    ITokenManager public outputTokenManager;
    
    // Mapping address to amounts which are excluded from vesting
    mapping(address => uint256) public unlockedAmounts;
    mapping(bytes32 => uint256) public amountMigratedFromWindow; 
    bytes32 public vestingWindowsMerkleRoot;

    function initialize(address _inputTokenManager, address _outputTokenManager) external onlyInit {
        inputTokenManager = ITokenManager(_inputTokenManager);
        outputTokenManager = ITokenManager(_outputTokenManager);
        initialized();
    }


    // PRIVILIGED FUNCTIONS ----------------------------------------------

    function increaseNonVested(address _holder, uint256 _amount) external auth(INCREASE_UNLOCKED_ROLE) {
        unlockedAmounts[_holder] = unlockedAmounts[_holder].add(_amount);
    }

    function setVestingWindowMerkleRoot(bytes32 _root) external auth(SET_VESTING_WINDOW_MERKLE_ROOT_ROLE) {
        vestingWindowsMerkleRoot = _root;
    }

    // MIGRATION FUNCTIONS -----------------------------------------------

    function migrateUnlocked(address _receiver, uint256 _amount) external returns(uint256) {
        // The max amount claimable is the amount not subject to vesting, _amount or the input token balance whatever is less.
        // TODO refactor this massive oneliner into something more readeable
        // Maybe save the _outputTokenManager address in the constuctor? not sure what is better regarding gas usage.
        uint256 amountClaimable = _amount.min256(unlockedAmounts[msg.sender]).min256(ERC20(inputTokenManager.token()).balanceOf(msg.sender));
        require(amountClaimable >= _amount, "CLAIM_AMOUNT_TOO_LARGE");

        // Decrease non vested amount
        unlockedAmounts[msg.sender] = unlockedAmounts[msg.sender].sub(_amount);

        // Burn input token
        inputTokenManager.burn(msg.sender, _amount);
        
        // Mint tokens to msg.sender
        outputTokenManager.mint(_receiver, _amount);

        return _amount;
    }

    function migrateVested(
        address _receiver,
        uint256 _amount,
        uint256 _windowAmount,
        uint256 _windowVestingStart,
        uint256 _windowVestingEnd,
        bytes32[] _proof
    ) external returns(uint256) {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _windowAmount, _windowVestingStart, _windowVestingEnd));
        require(MerkleProof.verify(_proof, vestingWindowsMerkleRoot, leaf), "MERKLE_PROOF_FAILED");

        // Migrate at max what is already vested and not already migrated
        uint256 migrateAmount = _amount.min256(calcVestedAmount(_windowAmount, block.timestamp, _windowVestingStart, _windowVestingEnd).sub(amountMigratedFromWindow[leaf]));
        // See "Migrating vested token, vesting already expired" for the case that needs this line
        migrateAmount = migrateAmount.min256(_windowAmount);
        amountMigratedFromWindow[leaf] = amountMigratedFromWindow[leaf].add(migrateAmount);

        // Burn input token
        inputTokenManager.burn(msg.sender, migrateAmount);
        
        // Mint tokens to receiver
        outputTokenManager.mint(_receiver, migrateAmount);

        return migrateAmount;
    }

    
    function calcVestedAmount(uint256 _amount, uint256 _time, uint256 _vestingStart, uint256 _vestingEnd) public view returns(uint256) {
        //_time.sub(_start) throws MATH_SUB_UNDERFLOW @ Migrating vested token, vesting is upcoming
        //_vested.sub(_start) throws MATH_SUB_UNDERFLOW @ Wrong vesting period
        if(_time < _vestingStart) {
            return 0;
        }
        //WARNING if _time == _start or _vested == _start, it will dividive with zero
        return _amount.mul(_time.sub(_vestingStart)) / _vestingEnd.sub(_vestingEnd);
    }

}