pragma solidity ^0.4.24;

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";

// Force compiler to pick up imports 
contract Imports {
    MiniMeToken public token;
    TokenManager public tokenManager;
    ACL public acl;
    Kernel public kernel;
    DAOFactory public daoFactory;
}