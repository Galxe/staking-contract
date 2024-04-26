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

interface ITokenUpgrade {
  // This function upgrade the erc20 token of the previous version to the new version.
  // Caller must pre-approve the amount of tokens to be upgraded to this contract,
  // and specify the amount in the amount parameter.
  function upgradeToken(uint256 amount) external returns (bool);
}
