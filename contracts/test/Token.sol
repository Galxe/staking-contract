// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev for testing purpose
contract Token is ERC20, Ownable {
    constructor(address owner) ERC20("test token", "TEST") {
        _mint(owner, 10000000 * 10**18);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @dev it allows anyone to mint token for testing purpose
    function mint(address account, uint amount) external {
        _mint(account, amount);
    }
}
