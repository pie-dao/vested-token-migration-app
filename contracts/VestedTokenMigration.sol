pragma solidity 0.4.24;

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/Math.sol";
import "@aragon/os/contracts/apps/AragonApp.sol";

import "./interfaces/ITokenManager.sol";
import "./libraries/MerkleProof.sol";

contract VestedTokenMigration is AragonApp {
    using SafeMath for uint256;
    using Math for uint256;

    bytes32 public constant SET_VESTING_WINDOW_MERKLE_ROOT_ROLE = keccak256("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE");


    ITokenManager public inputTokenManager;
    ITokenManager public outputTokenManager;
    
    // Mapping address to amounts which are excluded from vesting
    mapping(bytes32 => uint256) public amountMigratedFromWindow; 
    bytes32 public vestingWindowsMerkleRoot;

    function initialize(address _inputTokenManager, address _outputTokenManager) external onlyInit {
        inputTokenManager = ITokenManager(_inputTokenManager);
        outputTokenManager = ITokenManager(_outputTokenManager);
        initialized();
    }


    // PRIVILIGED FUNCTIONS ----------------------------------------------
    function setVestingWindowMerkleRoot(bytes32 _root) external auth(SET_VESTING_WINDOW_MERKLE_ROOT_ROLE) {
        vestingWindowsMerkleRoot = _root;
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
        require(_time > _vestingStart, "WRONG TIME" );

        //WARNING if _time == _start or _vested == _start, it will dividive with zero
        return _amount.mul(_time.sub(_vestingStart)) / _vestingEnd.sub(_vestingStart);
    }

}