pragma solidity 0.4.24;

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/Math.sol";
import "@aragon/os/contracts/apps/AragonApp.sol";

import "../openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/ITokenManager.sol";
import "./libraries/MerkleProof.sol";

contract VestedTokenMigration is AragonApp {
    using SafeMath for uint256;
    using Math for uint256;

    bytes32 public constant SET_VESTING_WINDOW_MERKLE_ROOT_ROLE = keccak256("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE");

    ITokenManager public inputTokenManager;
    ITokenManager public outputTokenManager;

    event Migrated(address indexed _from, address indexed _receiver, bytes32 indexed _leaf, uint256 _migratedAmount); 
    event VestingWindowMerkleRootSet(address indexed _setter, bytes32 indexed _root);
    // Mapping address to amounts which are excluded from vesting
    mapping(bytes32 => uint256) public amountMigratedFromWindow; 
    bytes32 public vestingWindowsMerkleRoot;

    /**
    * @notice Initialize vested token migration app with input `_inputTokenManager` and output `_outputTokenManager`.
    * @param _inputTokenManager Address of the input token
    * @param _outputTokenManager Address of the output token
    */
    function initialize(address _inputTokenManager, address _outputTokenManager) external onlyInit {
        require(_inputTokenManager != address(0), "INVALID_INPUT_TOKEN_MANAGER");
        require(_outputTokenManager != address(0), "INVALID_OUTPUT_TOKEN_MANAGER");
        inputTokenManager = ITokenManager(_inputTokenManager);
        outputTokenManager = ITokenManager(_outputTokenManager);
        initialized();
    }

    // PRIVILIGED FUNCTIONS ----------------------------------------------

    /**
    * @notice Change the vesting window merkle root.
    * @param _root The root of the merkle tree.
    */
    function setVestingWindowMerkleRoot(bytes32 _root) external auth(SET_VESTING_WINDOW_MERKLE_ROOT_ROLE) {
        vestingWindowsMerkleRoot = _root;
        emit VestingWindowMerkleRootSet(msg.sender, _root);
    }

    /**
    * @notice You will migrate `@withDecimals(_amount, 18)` tokens to `_receiver`.
    * @param _receiver Address of the token receiver.
    * @param _amount Amount of tokens.
    * @param _windowAmount Total amount of tokens subject to vesting.
    * @param _windowVestingStart The start of the vesting period. (timestamp)
    * @param _windowVestingEnd The end of the vesting period. (timestamp)
    * @param _proof Merkle proof
    * @return Amount that is actually migrated.
    */
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
        require(_windowVestingEnd > _windowVestingStart, "WRONG_PERIOD");
        // Migrate at max what is already vested and not already migrated
        uint256 migrateAmount = _amount.min256(calcVestedAmount(_windowAmount, block.timestamp, _windowVestingStart, _windowVestingEnd).sub(amountMigratedFromWindow[leaf]));
        if (migrateAmount == 0) {
            return migrateAmount;
        }

        amountMigratedFromWindow[leaf] = amountMigratedFromWindow[leaf].add(migrateAmount);
        assert(amountMigratedFromWindow[leaf] <= _windowAmount);

        // Burn input token
        inputTokenManager.burn(msg.sender, migrateAmount);

        // Mint tokens to receiver
        outputTokenManager.mint(_receiver, migrateAmount);

        emit Migrated(msg.sender, _receiver, leaf, migrateAmount);

        return migrateAmount;
    }

    /**
    * @notice You will migrate `@withDecimals(_amount, 18)` tokens to veDOUGH delivered to `_receiver`.
    * @param _receiver Address of the token receiver.
    * @param _amount Amount of tokens.
    * @param _windowAmount Total amount of tokens subject to vesting.
    * @param _windowVestingStart The start of the vesting period. (timestamp)
    * @param _windowVestingEnd The end of the vesting period. (timestamp)
    * @param _proof Merkle proof
    * @param _stakeDuration 
    */
    function migrateToVeDOUGH(
        address _receiver,
        uint256 _amount,
        uint256 _windowAmount,
        uint256 _windowVestingStart,
        uint256 _windowVestingEnd,
        bytes32[] _proof,
        uint256 _stakeDuration
    ) external {

        uint256 migrateAmount = migrateVested(address(this), _amount, _windowAmount, _windowVestingStart, _windowVestingEnd, _proof);
    
        // Mint tokens to this address
        address timeLock = 0x...
    
        // Approve DOUGH to Timelock
        IERC20(outputTokenManager.token()).safeApprove(timeLock, migrateAmount);

        // Deposit to timelock
        ISharesTimeLock(timeLock).depositByMonths(migrateAmount, _stakeDuration, _receiver)
    }

    
    function calcVestedAmount(uint256 _amount, uint256 _time, uint256 _vestingStart, uint256 _vestingEnd) public view returns(uint256) {
        require(_time > _vestingStart, "WRONG TIME" );
        if (_time >= _vestingEnd) {
            return _amount;
        }
        //WARNING if _time == _start or _vested == _start, it will dividive with zero
        return _amount.mul(_time.sub(_vestingStart)) / _vestingEnd.sub(_vestingStart);
    }
}