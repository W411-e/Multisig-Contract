// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract MultiSigWallet is Pausable {
    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data,
        TxType _txtype
    );
    event ConfirmTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        uint256 confirmations,
        TxType _txtype
    );
    event RevokeConfirmation(
        address indexed owner,
        uint256 indexed txIndex,
        uint256 confirmations,
        TxType _txtype
    );
    event ExecuteTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        uint256 confirmations,
        TxType _txtype
    );
    event CreateOwnerAddRequest(address requestBy, address probOwner);
    event OwnerAddition(address indexed owner);
    event CreateOwnerRemoveRequest(address requestBy, address probExOwner);
    event OwnerRemoval(address indexed owner);
    event CreateChangeRequirementRequest(
        address requester,
        uint256 numConfirmations
    );
    event ConfirmationRequirementChange(uint256 numConfirmationsRequired);
    event CreateTransferRequest(address receiver, uint256 value);
    event TransferUSDT(address receiver, uint256 value);
    event CreateUnpauseRequest();
    event ContractUnPaused();
    event ContractPaused();
    event EmergencyWithdraw(
        address receiver,
        address indexed owner,
        uint256 value
    );
    event EmergencyWithdrawETH(address receiver, address sender, uint256 value);

    address[] public owners;
    Transaction[] public transactions;
    address[] private _unPauseConfirmers;
    mapping(address => bool) public isOwner;
    // mapping from tx index => owner => bool
    mapping(uint256 => mapping(address => bool)) public isConfirmed;
    uint256 public numConfirmationsRequired;
    uint256 public lockedAmount;
    IERC20 public USDT;
    uint256 private _unpauseVote;

    enum TxType {
        OWNER,
        FUND,
        CONFIRMATION
    }

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numConfirmations;
        bool isUSDTtxn;
        TxType txtype;
    }

    modifier ownerExists() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier ownerDoesNotExist(address owner) {
        require(!isOwner[owner], "The requested owner is already owner");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "tx already confirmed");
        _;
    }

    modifier notNull(address _address) {
        require(!(_address == address(0)), "Address cannot be zero address");
        _;
    }

    modifier onlyContract() {
        require(
            msg.sender == address(this),
            "Only contract can call this method"
        );
        _;
    }

    constructor(
        address[] memory _owners,
        uint256 _numConfirmationsRequired,
        address usdt
    ) {
        require(_owners.length > 1, "owners required");
        require(
            _numConfirmationsRequired > 1 &&
                _numConfirmationsRequired <= _owners.length,
            "invalid number of required confirmations"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
        USDT = IERC20(usdt);
    }

    function pause() public ownerExists {
        _pause();
        emit ContractPaused();
    }

    function unpause() public onlyContract {
        _unpause();
        emit ContractUnPaused();
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data,
        bool _isUSDTtxn,
        TxType _txtype
    ) internal {
        uint256 txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 1,
                isUSDTtxn: _isUSDTtxn,
                txtype: _txtype
            })
        );
        isConfirmed[txIndex][msg.sender] = true;
        emit SubmitTransaction(
            msg.sender,
            txIndex,
            _to,
            _value,
            _data,
            _txtype
        );
    }

    function confirmTransaction(
        uint256 _txIndex
    )
        public
        whenNotPaused
        ownerExists
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;
        if (transaction.numConfirmations + 1 >= numConfirmationsRequired) {
            executeTransaction(_txIndex);
        }
        emit ConfirmTransaction(
            msg.sender,
            _txIndex,
            transaction.numConfirmations + 1,
            transaction.txtype
        );
    }

    function executeTransaction(uint256 _txIndex) internal {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numConfirmations >= numConfirmationsRequired,
            "cannot execute tx"
        );

        transaction.executed = true;
        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "tx failed");

        emit ExecuteTransaction(
            msg.sender,
            _txIndex,
            transaction.numConfirmations,
            transaction.txtype
        );
    }

    function revokeConfirmation(
        uint256 _txIndex
    )
        public
        whenNotPaused
        ownerExists
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(isConfirmed[_txIndex][msg.sender], "tx not confirmed");

        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(
            msg.sender,
            _txIndex,
            transaction.numConfirmations,
            transaction.txtype
        );
    }

    function addOwner(address owner) public whenNotPaused onlyContract {
        isOwner[owner] = true;
        owners.push(owner);
        emit OwnerAddition(owner);
    }

    function removeOwner(address owner) public whenNotPaused onlyContract {
        require(
            owners.length > 2,
            "you should at least have 3 owners to remove owner"
        );
        isOwner[owner] = false;
        for (uint256 i = 0; i < owners.length - 1; i++)
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }
        owners.pop();
        if (numConfirmationsRequired > owners.length)
            changeRequirement(owners.length);
        emit OwnerRemoval(owner);
    }

    function changeRequirement(
        uint256 _required
    ) public whenNotPaused onlyContract {
        require(_required >= 2, "need at least 2 confirmations");
        numConfirmationsRequired = _required;
        emit ConfirmationRequirementChange(_required);
    }

    function transferUSDT(address receiver, uint256 value) public onlyContract {
        bool success = USDT.transfer(receiver, value);
        require(success, "Transfer of USDT failed");
        lockedAmount -= value;
        emit TransferUSDT(receiver, value);
    }

    function createAddOwnerTxn(
        address _newOwner
    )
        public
        whenNotPaused
        ownerExists
        ownerDoesNotExist(_newOwner)
        notNull(_newOwner)
    {
        bytes memory data = abi.encodeWithSignature(
            "addOwner(address)",
            _newOwner
        );
        submitTransaction(address(this), 0, data, false, TxType.OWNER);
        emit CreateOwnerAddRequest(msg.sender, _newOwner);
    }

    function createRemoveOwnerTxn(
        address exOwner
    ) public whenNotPaused ownerExists {
        require(owners.length > 2, "Can't create remove owner request");
        require(isOwner[exOwner], "Owner does not exist");
        bytes memory data = abi.encodeWithSignature(
            "removeOwner(address)",
            exOwner
        );
        submitTransaction(address(this), 0, data, false, TxType.OWNER);
        emit CreateOwnerRemoveRequest(msg.sender, exOwner);
    }

    function createChangeRequirementTxn(
        uint256 numConfirmations
    ) public whenNotPaused ownerExists {
        require(numConfirmations > 1, "confirmations should be at least 2");
        bytes memory data = abi.encodeWithSignature(
            "changeRequirement(uint256)",
            numConfirmations
        );
        submitTransaction(address(this), 0, data, false, TxType.CONFIRMATION);
        emit CreateChangeRequirementRequest(msg.sender, numConfirmations);
    }

    function createApproveTxn(
        address receiver,
        uint256 value
    ) public whenNotPaused ownerExists {
        require(
            USDT.balanceOf(address(this)) >= lockedAmount + value,
            "Insufficient USDT amount in contract"
        );
        bytes memory data = abi.encodeWithSignature(
            "transferUSDT(address,uint256)",
            receiver,
            value
        );
        submitTransaction(address(this), 0, data, true, TxType.FUND);
        lockedAmount += value;
        emit CreateTransferRequest(receiver, value);
    }

    function createUnpauseTxn() public whenPaused ownerExists {
        if (_unpauseVote == numConfirmationsRequired - 1) {
            bytes memory data = abi.encodeWithSignature("unpause()");
            (bool success, ) = address(this).call{value: 0}(data);
            require(success, "Unpause Contract failed");
            delete _unPauseConfirmers;
            _unpauseVote = 0;
            emit ContractUnPaused();
        } else {
            for (uint256 i = 0; i < _unPauseConfirmers.length; i++) {
                require(
                    _unPauseConfirmers[i] != msg.sender,
                    "owner already voted"
                );
            }
            _unPauseConfirmers.push(msg.sender);
            _unpauseVote += 1;
            emit CreateUnpauseRequest();
        }
    }

    function emergencyWithdraw(
        address receiver,
        uint256 value
    ) public whenPaused ownerExists {
        //TODO:: may be we need to add multisig here too
        require(USDT.balanceOf(address(this)) >= value, "Insufficient USDT");
        require(
            receiver != msg.sender && isOwner[receiver],
            "You cannot withdraw funds to that address"
        );
        bool success = USDT.transfer(receiver, value);
        require(success, "Emergency withdraw failed");
        emit EmergencyWithdraw(receiver, msg.sender, value);
    }

    function emergencyWithdrawETH(
        address receiver,
        uint256 value
    ) public whenPaused ownerExists {
        //TODO:: may be we need to add multisig here too
        require(address(this).balance >= value, "Insufficient ETH");
        (bool success, ) = payable(receiver).call{value: value}("");
        require(success, "Failed to send Ether");
        emit EmergencyWithdrawETH(receiver, msg.sender, value);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(
        uint256 _txIndex
    )
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }
}
