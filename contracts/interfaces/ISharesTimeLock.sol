pragma solidity ^0.4.24;

interface ISharesTimeLock {
    function depositByMonths(uint256 amount, uint256 months, address receiver) external;
}