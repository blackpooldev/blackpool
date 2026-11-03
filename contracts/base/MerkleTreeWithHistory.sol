// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

interface IHasher {
  function poseidon(bytes32[2] calldata inputs) external pure returns (bytes32);
}

contract MerkleTreeWithHistory is Initializable {
  uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

  IHasher public immutable hasher;
  uint32 public immutable levels;

  // the following variables are made public for easier testing and debugging and
  // are not supposed to be accessed in regular code

  // filledSubtrees and roots could be bytes32[size], but using mappings makes it cheaper because
  // it removes index range check on every interaction
  mapping(uint256 => bytes32) public filledSubtrees;
  mapping(uint256 => bytes32) public roots;
  uint32 public constant ROOT_HISTORY_SIZE = 100;
  uint32 public currentRootIndex;
  uint32 public nextIndex;

  constructor(uint32 _levels, address _hasher) {
    require(_levels > 0, "_levels should be greater than zero");
    require(_levels < 32, "_levels should be less than 32");
    levels = _levels;
    hasher = IHasher(_hasher);
  }

  function _initialize() internal onlyInitializing {
    for (uint32 i = 0; i < levels; i++) {
      filledSubtrees[i] = zeros(i);
    }

    roots[0] = zeros(levels);
  }

  /**
    @dev Hash 2 tree leaves, returns Poseidon(_left, _right)
  */
  function hashLeftRight(bytes32 _left, bytes32 _right) public view returns (bytes32) {
    require(uint256(_left) < FIELD_SIZE, "_left should be inside the field");
    require(uint256(_right) < FIELD_SIZE, "_right should be inside the field");
    bytes32[2] memory input;
    input[0] = _left;
    input[1] = _right;
    return hasher.poseidon(input);
  }

  // Modified to insert pairs of leaves for better efficiency
  function _insert(bytes32 _leaf1, bytes32 _leaf2) internal returns (uint32 index) {
    uint32 _nextIndex = nextIndex;
    require(_nextIndex != uint32(2)**levels, "Merkle tree is full. No more leaves can be added");
    uint32 currentIndex = _nextIndex / 2;
    bytes32 currentLevelHash = hashLeftRight(_leaf1, _leaf2);
    bytes32 left;
    bytes32 right;

    for (uint32 i = 1; i < levels; i++) {
      if (currentIndex % 2 == 0) {
        left = currentLevelHash;
        right = zeros(i);
        filledSubtrees[i] = currentLevelHash;
      } else {
        left = filledSubtrees[i];
        right = currentLevelHash;
      }
      currentLevelHash = hashLeftRight(left, right);
      currentIndex /= 2;
    }

    uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
    currentRootIndex = newRootIndex;
    roots[newRootIndex] = currentLevelHash;
    nextIndex = _nextIndex + 2;
    return _nextIndex;
  }

  /**
    @dev Whether the root is present in the root history
  */
  function isKnownRoot(bytes32 _root) public view returns (bool) {
    if (_root == 0) {
      return false;
    }
    uint32 _currentRootIndex = currentRootIndex;
    uint32 i = _currentRootIndex;
    do {
      if (_root == roots[i]) {
        return true;
      }
      if (i == 0) {
        i = ROOT_HISTORY_SIZE;
      }
      i--;
    } while (i != _currentRootIndex);
    return false;
  }

  /**
    @dev Returns the last root
  */
  function getLastRoot() public view returns (bytes32) {
    return roots[currentRootIndex];
  }

  /// @dev provides Zero (Empty) elements for a Poseidon MerkleTree. Up to 31 levels
  function zeros(uint256 i) public pure returns (bytes32) {
    if (i == 0) return bytes32(0x1edb91df646d66b3e01420a5b8316cb085a4c3999f548d66afd87cfb555e5bd6);
    else if (i == 1) return bytes32(0x0292fa1ba9046decc50bbecfd023e11cf2224cc4cfe893ced228b96b7500a4c7);
    else if (i == 2) return bytes32(0x182d66a47ac8a8bf2882ce94a5b3028f743dd5810a415adaf0306e14cde7833f);
    else if (i == 3) return bytes32(0x077728052e7778c7ae1dda2dacb325454befe041073c5200f8199b8431bf03d9);
    else if (i == 4) return bytes32(0x1784639ee66802e4df90f6fc3f953113fbc0c4944012c0df5235ad4dcd6d3f25);
    else if (i == 5) return bytes32(0x264baf02318d5193f624e31bf72783ea410ba27e14b1892e116a676e2d2f9a5e);
    else if (i == 6) return bytes32(0x2aa2e62d728292c5eaab531649e48e33172ee8ccdeb7ddd6d134cb49f94af935);
    else if (i == 7) return bytes32(0x1d3e140ea5a437c9dc3bc37fd658a3ea06907f5665d8110f2037176b46243093);
    else if (i == 8) return bytes32(0x0daa68a20273dbfaa318005eb1f8ac2801ae51e26981cd8d5f8f082525452a78);
    else if (i == 9) return bytes32(0x219cca480cc1eb235de90cedbeedb185e13490e7d1259fb775cf8fa710f41766);
    else if (i == 10) return bytes32(0x047eec615ee4dc5e1d09b9e54807997ad6ea580396fe29938b97dce8a2af7028);
    else if (i == 11) return bytes32(0x2eca04c4b3d137ddf96e09916cc580db87a33548165b64eadf6fd8ca241469bb);
    else if (i == 12) return bytes32(0x0825958e35ef7b04a67555ebd6df128611be47758f562b3f89838e4851171521);
    else if (i == 13) return bytes32(0x020e1696a2b68f3a93e98874d209a6534b3be3add250e034c40a84d3c2d999ef);
    else if (i == 14) return bytes32(0x20d6f476bb800532c4b28cf862dcea0128b4052e9651bbf308d2d6e69626fab5);
    else if (i == 15) return bytes32(0x0333e01fd7171f8c0b2fc5d71a9ea3d68e9f06ef3bbeed3640a8370d30eaab9e);
    else if (i == 16) return bytes32(0x0e7536818cdd622837738e923a9f34da7be581fab532e00e90e4707c34bc4c15);
    else if (i == 17) return bytes32(0x0b40bd2b00624c666d4ee82f8ed404b59f7e498ad5af5f0a5ecdab4ce4426aa9);
    else if (i == 18) return bytes32(0x07f64b860d831bb658a95ce2da2843e2f29469b3bfb391a8c16b55f90415e05a);
    else if (i == 19) return bytes32(0x27b53c5e7867d356696f9e9668cddaf3234a94bb513a432b6cfb76efd8df7961);
    else if (i == 20) return bytes32(0x1b201ade6b56011968ff645d414a0e9783545b5c22304280824fc7cc1a021404);
    else if (i == 21) return bytes32(0x25aab5c5cac73870b52cbd446da11193d2341a0e68d381029d48f93406e3a4b2);
    else if (i == 22) return bytes32(0x0c2442eb697fda9c743a93dc9018b5e3c2e077471c6914561155562e28a8beda);
    else if (i == 23) return bytes32(0x0bdd161a34df09b3329aac92fc32050c13bfa3e8e6c94f5ab1c4096fe7d97807);
    else if (i == 24) return bytes32(0x22cf6f281e851fd341872dacffb0047cd7967c556abf979f50050d1b7931710d);
    else if (i == 25) return bytes32(0x21a7baab1b0c2a42eb32d9dd811bf0a247b8a1b461f99700c2015bcb4f11dcfd);
    else if (i == 26) return bytes32(0x27649caa5d574a036dccf1845a65e83f336acb6b30030f8ffb34ce80d8a42e6a);
    else if (i == 27) return bytes32(0x288f117cf812c0c11ed756d3370915fcd5899e3736d555f9ebc97c09d5be39ec);
    else if (i == 28) return bytes32(0x2a180ab530138e374249129fbcd9525ba5cd5e469b5305f18307c69769d86bb1);
    else if (i == 29) return bytes32(0x13fc5c5d8d2b3aa9b8aa22d8abd2167aea474d59ceac2aa2dcd82bd4cffb2d02);
    else if (i == 30) return bytes32(0x25553a17ead7a4c9664359592d6f4f71769b683723e2d0018dfc7d8f306737b2);
    else if (i == 31) return bytes32(0x18cdb1528e38f0fdb98bfbb90c3d218bcdaa04a233704f55743a42c55055de29);
    else revert("Index out of bounds");
  }

  uint256[47] private __gap;
}
