/*
    Copyright 2024 Galxe.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

    SPDX-License-Identifier: Apache-2.0
*/

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import "./ITokenUpgrade.sol";

contract GalxeStaking is Pausable, Ownable {

    /* ============ Constructor ============ */
    constructor(address owner) {
        transferOwnership(owner);
    }

    /* ============ Initializer ============ */
    function initialize(IERC20 _token) external onlyOwner {
        require(!initialized, "Contract is already initialized");
        initialized = true; // Ensure initialize can't be called again
        allowedToken = _token;
        emit TokenChanged(_token);
    }

    /* ============ State Variables ============ */
    bool private initialized;
    uint256 public constant unStakeLimit = 10;

    // Timestamp related variables
    uint256 public lockTimePeriod;

    // token multiplier for future token upgrade
    uint256 public multiplier = 60;

    // total balance map: userAddress => amount
    mapping(address => uint256) public balances;

    // UnStakeInfo record user lockInfo, when claimed deleted
    struct UnStakeInfo {
        uint256 unStakeTime;
        uint256 amount;
    }
    mapping(address => UnStakeInfo[]) public unStakeInfoMap;

    // Allowed ERC20 token
    IERC20 public allowedToken;

    /* ============ Events ============ */
    event TokenChanged(IERC20 indexed token);
    event TokenUpgraded(IERC20 indexed token, ITokenUpgrade indexed upgrader, uint256 amount, uint256 multiplier);
    event TokenAndMultiplierChanged(IERC20 indexed token, uint256 multiplier);
    event LockDurationUpdated(uint256 _timePeriodInSeconds);

    event TokenStaked(address indexed userAddress, uint256 amount);
    event TokenRevokeUnStaked(address indexed userAddress, UnStakeInfo unStakeInfo);
    event TokenUnStaked(address indexed userAddress, UnStakeInfo unStakeInfo);
    event TokenWithdraw(address indexed userAddress, UnStakeInfo unStakeInfo);

    /* ============ External Functions ============ */
    function upgradeToken(IERC20 _newToken, ITokenUpgrade upgrade, uint256 _multiplier) external onlyOwner {
        require(_multiplier > 0, "Multiplier must be greater than 0");
        uint256 amount = allowedToken.balanceOf(address(this)) * multiplier;
        require(_newToken.approve(address(upgrade), amount), "Approve token cannot fail");
        require(upgrade.upgradeToken(amount), "Upgrade token cannot fail");
        allowedToken = _newToken;
        multiplier = _multiplier;
        emit TokenUpgraded(_newToken, upgrade, amount, _multiplier);
    }

    // only change token and multiplier, token upgrade should be done somehow manually.
    function changeTokenAndMultiplier(IERC20 _token, uint256 _multiplier) external onlyOwner {
        require(_multiplier > 0, "Multiplier must be greater than 0");
        allowedToken = _token;
        multiplier = _multiplier;
        emit TokenAndMultiplierChanged(_token, _multiplier);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Sets the lock time of unstake in seconds i.e. 3600 = 1 hour
     * @param _timePeriodInSeconds amount of seconds to lock time of unstake
     */
    function setLockDuration(uint256 _timePeriodInSeconds) public onlyOwner  {
        lockTimePeriod = _timePeriodInSeconds;
        emit LockDurationUpdated(_timePeriodInSeconds);
    }

    function getUnStakeInfo(address user) external view returns (UnStakeInfo[] memory) {
        UnStakeInfo[] memory unStakeInfoArray = unStakeInfoMap[user];
        uint256 index = 0;
        for (; index < unStakeInfoArray.length; index++) {
            unStakeInfoArray[index].amount /= multiplier;
        }
        return unStakeInfoArray;
    }

    /**
     * @dev User stack token when the contract is not paused.
     * @param amount, amount of stake.
     */
    function stakeToken(uint256 amount) public whenNotPaused {
        require(address(allowedToken) != address(0), "Must be allowed token.");
        require(amount <= allowedToken.balanceOf(msg.sender), "Insufficient token balance, please edit amount and try again.");
        require(
            allowedToken.allowance(msg.sender, address(this)) >= amount,
            "Approve tokens first!"
        );
        _transferToken(msg.sender, address(this), amount);

        balances[msg.sender] = balances[msg.sender] + amount * multiplier;
        emit TokenStaked(msg.sender, amount);
    }

    /**
     * @dev Allow users to stake tokens allowed by the contract.
     * @param amount, amount of unstake.
     */
    function unStake(uint256 amount) public whenNotPaused {
        amount = amount * multiplier;
        require(lockTimePeriod > 0, "Please set the time stamp first, then try again.");
        require(address(allowedToken) != address(0), "Must be allowed token.");
        require(amount > 0 , "amount is invalid, please edit amount and try again.");
        require(unStakeInfoMap[msg.sender].length < unStakeLimit , "The unStake queue has reached the upper limit of 10 and needs to be revoke or withdraw before proceeding.");
        require(balances[msg.sender] >= amount, "Insufficient token balance, please edit amount and try again.");

        UnStakeInfo memory unStakeInfo = UnStakeInfo(block.timestamp, amount);

        // sub balances
        balances[msg.sender] = balances[msg.sender] - amount;
        unStakeInfoMap[msg.sender].push(unStakeInfo);

        unStakeInfo.amount /= multiplier;
        emit TokenUnStaked(msg.sender, unStakeInfo);
    }

    /**
     * @dev Allow users renege during the unstack lock cycle.
     * @param index, The index of unstakee.
     */
    function revokeUnStake(uint256 index) public whenNotPaused {
        require(address(allowedToken) != address(0), "Must be allowed token");
        require(unStakeInfoMap[msg.sender].length > index, "index is invalid, please refresh the page and try again.");
        UnStakeInfo storage unStakeInfo = unStakeInfoMap[msg.sender][index];

        balances[msg.sender] = balances[msg.sender] + unStakeInfo.amount;

        UnStakeInfo memory tmpInfo = _removeAtIndex(index);

        tmpInfo.amount = tmpInfo.amount / multiplier;
        emit TokenRevokeUnStaked(msg.sender, tmpInfo);
    }

    /**
     * @dev Allow users to withdraw staked tokens after the correct period of time.
     * @param index, The index of unstakee.
     */
    function withdrawUnLockedToken(uint256 index) public whenNotPaused {
        require(address(allowedToken) != address(0), "Must be allowed token.");
        require(unStakeInfoMap[msg.sender].length > index, "index is invalid, please refresh the page and try again.");

        if (block.timestamp >= unStakeInfoMap[msg.sender][index].unStakeTime + lockTimePeriod) {
            UnStakeInfo memory tmpInfo = _removeAtIndex(index);
            tmpInfo.amount = tmpInfo.amount / multiplier;
            _transferToken(address(this), msg.sender, tmpInfo.amount);
            emit TokenWithdraw(msg.sender, tmpInfo);
        } else {
            revert("Tokens are only available after correct time period has elapsed");
        }
    }

    /**
     * @dev Allow users to withdraw staked tokens after the correct period of time.
     */
    function withdrawAllUnLockedToken() public whenNotPaused {
        require(address(allowedToken) != address(0), "Must be allowed token.");
        require(unStakeInfoMap[msg.sender].length > 0, "unStaking token is 0.");
        UnStakeInfo[] storage unStakeInfoArray = unStakeInfoMap[msg.sender];

        uint256 amount = 0;
        uint256 index = 0;
        for (; index < unStakeInfoArray.length; index++) {
            if (block.timestamp >= unStakeInfoArray[index].unStakeTime + lockTimePeriod) {
                amount = amount + unStakeInfoArray[index].amount;
            } else {
                break;
            }
        }

        if (amount > 0) {
            _removeBeforeIndex(index);
            _transferToken(address(this), msg.sender, amount / multiplier);
        } else {
            revert("Tokens are only available after correct time period has elapsed");
        }
    }

    /**
     * * @dev Get stake record by user address.
     */
    function getStakeAmount(address _user) external view returns (uint256) {
        return balances[_user] / multiplier;
    }

    /**
     * * @dev Pay fees for a given plan.
     */
    function _transferToken(address from, address to, uint256 amount) private {
        if (from == address(this)) {
            require(allowedToken.transfer(to, amount), "Transfer token failed");
        } else {
            require(allowedToken.transferFrom(from, to, amount), "Transfer token failed");
        }
    }

    /**
     * @dev Recovers a `tokenAmount` of the ERC20 `tokenAddress` locked into this contract
     * and sends them to the `tokenReceiver` address.
     *
     * @param tokenAddress The contract address of the token to recover.
     * @param tokenReceiver The address that will receive the recovered tokens.
     * @param tokenAmount Number of tokens to be recovered.
     */
    function recoverERC20(IERC20 tokenAddress, address tokenReceiver, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != allowedToken, "only not allowedToken can be recover");
        require(tokenAddress.transfer(tokenReceiver, tokenAmount), "Transfer token failed");
    }

    function _removeAtIndex(uint256 index) private returns (UnStakeInfo memory) {
        require(index < unStakeInfoMap[msg.sender].length, "Index out of bounds");
        UnStakeInfo[] storage unStakeInfoArray = unStakeInfoMap[msg.sender];
        UnStakeInfo memory tmpInfo = unStakeInfoArray[index];
        for (uint256 i = index; i < unStakeInfoArray.length - 1; i++) {
            unStakeInfoArray[i] = unStakeInfoArray[i + 1];
        }

        unStakeInfoArray.pop();

        return tmpInfo;
    }

    function _removeBeforeIndex(uint256 index) private {
        require(index <= unStakeInfoMap[msg.sender].length, "Index out of bounds");
        UnStakeInfo[] storage unStakeInfoArray = unStakeInfoMap[msg.sender];
        uint256 length = unStakeInfoArray.length;

        for (uint256 i = 0; i < index; i++) {
            unStakeInfoArray[i].amount = unStakeInfoArray[i].amount / multiplier;
            emit TokenWithdraw(msg.sender, unStakeInfoArray[i]);
        }

        for (uint256 i = 0; i < length; i++) {
            if (i < length - index) {
                unStakeInfoArray[i] = unStakeInfoArray[i + index];
            } else {
                unStakeInfoArray.pop();
            }
        }
    }
}
