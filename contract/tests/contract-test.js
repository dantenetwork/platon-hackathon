const chai = require('chai');
const { on } = require('cluster');
const assert = chai.assert;
const expect = chai.expect;
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3('http://127.0.0.1:6789');
const blockchain = require('./blockchain.js');
const config = require('config');
const exp = require('constants');

// test account address, lat120swfan2f50myx2g5kux4t8la9ypsz94dhh5ex
const testAccountPrivateKey = '0x34382ebae7d7c628e13f14b4314c9b0149db7bbbc06428ae89de9883ffc7c341';// private key, Testnet only
const testAccount = web3.platon.accounts.privateKeyToAccount(testAccountPrivateKey).address; // 私钥导出公钥

// market contract
let marketContract;
let marketContractAddress = config.get('marketContractAddress');

// verify contract
let verifyContract;
let verifyContractAddress = config.get('verifyContractAddress');

// mining contract
let miningContract;
let miningContractAddress = config.get('miningContractAddress');

// token contract
let tokenContractAddress = config.get('tokenContractAddress');
const tempTokenContractAddress = tokenContractAddress;

const ONE_TOKEN = '1000000000000000000';
const THOUSAND_TOKENS = '1000000000000000000000';
const FIVE_HUNDRED_TOKENS = '500000000000000000000';

const enclave_public_key = '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdb';
const size = 100;

// test case 
describe('dante market&verify unit test', function () {
  before(async function () {
    // market contract abi
    let marketRawData = fs.readFileSync('../build/contracts/market.abi.json');
    let marketAbi = JSON.parse(marketRawData);

    marketContract = new web3.platon.Contract(marketAbi, marketContractAddress, { vmType: 1 });

    // verify contract abi
    let verifyRawData = fs.readFileSync('../build/contracts/verify.abi.json');
    let verifyAbi = JSON.parse(verifyRawData);
    verifyContract = new web3.platon.Contract(verifyAbi, verifyContractAddress, { vmType: 1 });

    // token contract abi 
    let tokenRawData = fs.readFileSync('./token.abi.json');
    let tokenAbi = JSON.parse(tokenRawData);
    tokenContract = new web3.platon.Contract(tokenAbi, tokenContractAddress, { vmType: 1 });
  });

  it('approve token', async function () {
    // 发送交易
    try {
      this.timeout(0);

      // Query allowance of testAccount address
      let balance = await blockchain.contractCall(tokenContract, 'balanceOf', [testAccount]);
      console.log('test account '+testAccount + ' balance: ' + balance);

      // approve verify contract
      await blockchain.sendTransaction(tokenContract, 'approve', testAccountPrivateKey, [verifyContractAddress, THOUSAND_TOKENS]);

      // expect allowance of testAccount address = THOUSAND_TOKENS
      let allowance = await blockchain.contractCall(tokenContract, 'allowance', [testAccount, verifyContractAddress]);
      console.log(testAccount+' approved ' + verifyContractAddress+', allowance: ' + allowance);
      
      // approve market contract
      await blockchain.sendTransaction(tokenContract, 'approve', testAccountPrivateKey, [marketContractAddress, THOUSAND_TOKENS]);

      // expect allowance of testAccount address = THOUSAND_TOKENS
      allowance = await blockchain.contractCall(tokenContract, 'allowance', [testAccount, marketContractAddress]);
      console.log(testAccount+' approved ' + marketContractAddress+', allowance: ' + allowance);
      
    } catch (error) {
      console.log(error);
    }
  });

  it('verify register_miner', async function () {
    try {
      this.timeout(0);

      // change mining contract to {{miningContractAddress}}
      // const verifyContractPrivateKey = '0x43a5ab4b584ff12d2e81296d399636c0dca10480ca2087cadbc8ad246d0d32a6';
      // await blockchain.sendTransaction(verifyContract, 'set_mining_contract', verifyContractPrivateKey, [miningContractAddress]);
      
      // test data
      const reward_address = testAccount;
      miner = [enclave_public_key, reward_address,50];
      
      // detect miner exists or not
      let ret = await blockchain.contractCall(verifyContract, 'get_miner', [enclave_public_key]);
      
      if (ret[0] == enclave_public_key) {
        console.log('the miner ' + enclave_public_key + ' is already exists');
      } else {
        await blockchain.sendTransaction(verifyContract, 'register_miner', testAccountPrivateKey, miner);  
      }

      await blockchain.sendTransaction(verifyContract, 'pledge_miner', testAccountPrivateKey, [enclave_public_key,THOUSAND_TOKENS]);

      // quer miner info
      ret = await blockchain.contractCall(verifyContract, 'get_miner', [enclave_public_key]);
      
      expect(ret[0]).to.equal(enclave_public_key);// enclave_public_key
      expect(ret[2]).to.equal(reward_address);// reward_address
      expect(ret[3]).to.equal(testAccount);// testAccount
      expect(ret[4]).to.equal(THOUSAND_TOKENS);
      expect(ret[5]).to.equal(1024 * 1024 * 1024 * 1000 + '');

      // ensure miner count = 1
      const minerCount = await blockchain.contractCall(verifyContract, 'get_miner_count');
      expect(parseInt(minerCount)).to.equal(1);

      return;
      await blockchain.sendTransaction(verifyContract, 'unpledge_miner', testAccountPrivateKey, [enclave_public_key]);
      
      // quer miner info
      ret = await blockchain.contractCall(verifyContract, 'get_miner', [enclave_public_key]);
      // console.log(ret);

      expect(ret[0]).to.equal(enclave_public_key);// enclave_public_key
      expect(ret[2]).to.equal(reward_address);// reward_address
      expect(ret[3]).to.equal(testAccount);// testAccount
      expect(ret[4]).to.equal('0');
      expect(ret[5]).to.equal('0');

    } catch (e) {
      console.error(e);
    }
  });
  

  it('verify verify_signature', async function () {
    try {
      this.timeout(0);

      const hashed_value = '0xa1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2';
      const enclave_signature = '0xf28b8fde3ea610e59590da237b9e99871390fd458baae8d30e2da070ac9850f70cb89a8fb817d73a3709b375c3aee82a5b64fae5743cbd95feff1bb6965f040b00';

      const param = [enclave_public_key,hashed_value,enclave_signature];
      await blockchain.sendTransaction(verifyContract, 'verify_signature', testAccountPrivateKey, param);
    } catch (e) {
      console.log(e);
    }
  });
  
  
  it('market add_deal', async function () {
    try {
      this.timeout(0);
      // test data
      const price = '10000000000000000';
      const duration = 500;
      const provider_required = 2;

      const totalPrice = price * duration * provider_required;

      dealInfo = [cid, size, price, duration, provider_required];

      let onchainDealByCid = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      if (onchainDealByCid[0] == cid) {
        console.log('the deal ' + cid + ' is already exists');
        return;
      }

      // send transaction
      const ret = await blockchain.sendTransaction(marketContract, 'add_deal', testAccountPrivateKey, dealInfo);

      // quer deal info by cid
      onchainDealByCid = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      // console.log(onchainDealByCid);

      // expect onchain info = test data
      assert.isArray(onchainDealByCid);
      expect(onchainDealByCid[0]).to.equal(cid);
      expect(onchainDealByCid[1]).to.equal(0);
      expect(onchainDealByCid[2]).to.equal(false);
      expect(onchainDealByCid[3]).to.equal(size + '');
      expect(onchainDealByCid[4]).to.equal(price + '');
      expect(onchainDealByCid[5]).to.equal(duration + '');
      expect(onchainDealByCid[7]).to.equal(testAccount);
      expect(onchainDealByCid[8]).to.equal(provider_required);
      expect(parseInt(onchainDealByCid[9])).to.equal(totalPrice);
      expect(parseInt(onchainDealByCid[10])).to.equal(totalPrice);


      onchainDealByCid = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      // console.log('deal info:');
      // console.log(onchainDealByCid);

      // ensure deal count = 1
      const minerCount = await blockchain.contractCall(marketContract, 'get_deal_count');
      expect(parseInt(minerCount)).to.equal(1);
      
    } catch (e) {
      console.error(e);
    }
  });

  // renewal deal
  it('verify renewal_deal', async function () {
    try {
      this.timeout(0);
      // test data
      const duration = 500;
      dealInfo = [cid, duration];

      // send transaction
      const ret = await blockchain.sendTransaction(marketContract, 'renewal_deal', testAccountPrivateKey, dealInfo);

      // quer deal info by cid
      onchainDealByCid = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      // console.log('deal info:');
      // console.log(onchainDealByCid);

      // expect onchain info = test data
      assert.isArray(onchainDealByCid);
      expect(onchainDealByCid[0]).to.equal(cid);
      expect(onchainDealByCid[1]).to.equal(0);
      expect(onchainDealByCid[5]).to.equal(duration*2 + '');
      expect(onchainDealByCid[7]).to.equal(testAccount);
      expect(onchainDealByCid[9]).to.equal('20000000000000000000');
      expect(onchainDealByCid[10]).to.equal('20000000000000000000');
    } catch (e) {
      console.log(e);
    }
  });


  // update storage proof
  it('verify update_storage_proof', async function () {
    // 发送交易
    try {
      this.timeout(0);
      const enclave_timestamp = new Date().getTime();
      const enclave_idle_size = 1048576 * 2;
      const enclave_stored_size = 0;
      const enclave_stored_files = [];
      const hashed_value = 'hashed_value';
      const enclave_signature = '0x6218ff2883e9ee97e29da6a3d6fe0f59081c2de9143b8dee336059c67fc249d965dbc3e5f6d3f0ae598d6be97c39a7a204d0636e50b0d56677eec7d84267c92801';

      const param = [enclave_public_key, enclave_timestamp, enclave_idle_size, enclave_stored_size, enclave_stored_files, hashed_value, enclave_signature];

      await blockchain.sendTransaction(verifyContract, 'update_storage_proof', testAccountPrivateKey, param);

      let ret = await blockchain.contractCall(verifyContract, 'get_total_capacity');
      console.log('total capacity:');
      console.log(ret);
      expect(ret).to.equal(enclave_idle_size+'');

      ret = await blockchain.contractCall(verifyContract, 'get_storage_proof', [enclave_public_key]);
      // console.log('proof info:');
      // console.log(ret);
    } catch (e) {
      console.log(e);
    }
  });

  
  // fill deal
  it('verify fill_deal', async function () {
    // 发送交易
    try {
      this.timeout(0);
      const enclave_timestamp = new Date().getTime();
      const enclave_stored_size = 1048576;
      const enclave_stored_files = [[cid, size]];
      const hashed_value = 'hashed_value';
      const enclave_signature = '0x6218ff2883e9ee97e29da6a3d6fe0f59081c2de9143b8dee336059c67fc249d965dbc3e5f6d3f0ae598d6be97c39a7a204d0636e50b0d56677eec7d84267c92801';

      const param = [enclave_public_key, enclave_timestamp, enclave_stored_size, enclave_stored_files, hashed_value, enclave_signature];
      console.log(param);

      await blockchain.sendTransaction(verifyContract, 'fill_deal', testAccountPrivateKey, param);

      let ret = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      // console.log(ret);

    } catch (e) {
      console.log(e);
    }
  });
  
  // update storage proof
  it('verify update_storage_proof', async function () {
    // 发送交易
    try {
      this.timeout(0);
      console.log('--------------------------- update storage proof again ---------------------------');
      const enclave_timestamp = new Date().getTime()+'';
      const enclave_idle_size = 1048576;
      const enclave_stored_size = 1048576;
      const enclave_stored_files = [[cid, size]];
      const hashed_value = 'hashed_value';
      const enclave_signature = '0x6218ff2883e9ee97e29da6a3d6fe0f59081c2de9143b8dee336059c67fc249d965dbc3e5f6d3f0ae598d6be97c39a7a204d0636e50b0d56677eec7d84267c92801';

      const param = [enclave_public_key, enclave_timestamp, enclave_idle_size, enclave_stored_size, enclave_stored_files, hashed_value, enclave_signature];

      await blockchain.sendTransaction(verifyContract, 'update_storage_proof', testAccountPrivateKey, param);

      let ret = await blockchain.contractCall(verifyContract, 'get_total_capacity');
      console.log('total capacity:');
      console.log(ret);
      expect(ret).to.equal(enclave_idle_size+enclave_stored_size+'');

      ret = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      console.log('deal info:');
      console.log(ret);

      ret = await blockchain.contractCall(verifyContract, 'get_storage_proof', [enclave_public_key]);
      console.log('proof info:');
      console.log(ret);
    } catch (e) {
      console.log(e);
    }
  });
  return;
  
  // withdraw deal
  it('verify withdraw_deal', async function () {
    // 发送交易
    try {
      this.timeout(0);
      const param = [enclave_public_key, cid];

      const ret = await blockchain.sendTransaction(verifyContract, 'withdraw_deal', testAccountPrivateKey, param);
      // console.log(ret);

      onchainDealByCid = await blockchain.contractCall(marketContract, 'get_deal_by_cid', [cid]);
      console.log('deal info:');
      console.log(onchainDealByCid);
    } catch (e) {
      console.log(e);
    }
  });

  
  // update miner
  it('verify update_miner', async function () {
    try {
      this.timeout(0);
      // test data
      const reward_address = 'lat120swfan2f50myx2g5kux4t8la9ypsz94dhh5ex';
      miner = [enclave_public_key, reward_address,50];

      // send transaction
      const ret = await blockchain.sendTransaction(verifyContract, 'update_miner', testAccountPrivateKey, miner);

      // quer miner info
      let onchainMiner = await blockchain.contractCall(verifyContract, 'get_miner', [enclave_public_key]);
      // console.log(onchainMiner);

      expect(onchainMiner[0]).to.equal(enclave_public_key);// enclave_public_key
      expect(onchainMiner[2]).to.equal(reward_address);// reward_address
      expect(onchainMiner[3]).to.equal(testAccount);// testAccount
    } catch (e) {
      console.error(e);
    }
  });

  it('verify submit_miner_info', async function () {
    try {
      this.timeout(0);
      // test data
      const name = 'Hello World';
      const peer_id = '10737418241111111111073741824111111111';
      const country_code = '72';
      const url = 'https://google.com';

      miner = [name, peer_id, country_code, url];

      // send transaction
      const ret = await blockchain.sendTransaction(verifyContract, 'submit_miner_info', testAccountPrivateKey, miner);

      // quer miner info
      let onchainMinerInfo = await blockchain.contractCall(verifyContract, 'get_miner_info', [testAccount]);
      // console.log(onchainMinerInfo);

      // expect onchain info = test data
      assert.isArray(onchainMinerInfo);
      expect(onchainMinerInfo[0]).to.equal(testAccount);// testAccount
      expect(onchainMinerInfo[1]).to.equal(name);// name
      expect(onchainMinerInfo[2]).to.equal(peer_id);// peer_id
      expect(onchainMinerInfo[3]).to.equal(country_code);// country_code
      expect(onchainMinerInfo[4]).to.equal(url);// url
    } catch (e) {
      console.error(e);
    }
  });
  

  // erase miner
  it('verify unregister_miner', async function () {
    try {
      this.timeout(0);
    
      // send transaction
      const ret = await blockchain.sendTransaction(verifyContract, 'unregister_miner', testAccountPrivateKey, [enclave_public_key]);
      // expect ret is object

      // quer miner info
      let onchainMiner = await blockchain.contractCall(verifyContract, 'get_miner', [enclave_public_key]);
      // console.log(onchainMiner);

      // expect onchainMinerInfo is empty
      assert.isArray(onchainMiner);
      expect(onchainMiner[0]).to.equal('');// enclave_public_key
      expect(onchainMiner[1]).to.equal('lat1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq542u6a');// enclave_lat_address
      expect(onchainMiner[2]).to.equal('lat1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq542u6a');// reward_address
      expect(onchainMiner[2]).to.equal('lat1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq542u6a');// testAccount

    } catch (e) {
      console.error(e);
    }
  });
  

  it('market contract set owner & token contract', async function () {
    try {
      this.timeout(0);
      // deploy market contract account address, lat1qavfd7zwaknrxyx0drcmv0vr5zehgthhaqq6ul
      const marketPrivateKey = '0x4940cf212544505a0fad3e3932734220af101da915321489708f69bc908fda65'; // private key, Testnet only

      // expect token contract address = tokenContractAddress
      let tokenAddress = await blockchain.contractCall(marketContract, 'get_token_contract', []);
      expect(tokenAddress).to.equal(tokenContractAddress);

      ////////////////////////////////////////////////////////////
      // change owner to testAccount
      await blockchain.sendTransaction(marketContract, 'set_owner', marketPrivateKey, [testAccount]);
      // expect contract owner = testAccount
      let currentContractOwner = await blockchain.contractCall(marketContract, 'get_owner', []);
      expect(currentContractOwner).to.equal(testAccount);

      // change token contract to {{contractAccount}}
      await blockchain.sendTransaction(marketContract, 'set_token_contract', testAccountPrivateKey, [tempTokenContractAddress]);

      // expect token contract address = {{contractAccount}}
      let currentTokenAddress = await blockchain.contractCall(marketContract, 'get_token_contract', []);
      expect(currentTokenAddress).to.equal(tempTokenContractAddress);

    } catch (e) {
      console.error(e);
    }
  });

  it('verify contract set_owner & set_token_contract', async function () {
    try {
      this.timeout(0);

      // deploy verify contract account address, lat1nhm9fq0vhrfw48e4cevds95xtxxg0f0jc48aq3
      const verifyPrivateKey = '0x43a5ab4b584ff12d2e81296d399636c0dca10480ca2087cadbc8ad246d0d32a6'; // private key, Testnet only

      // expect token contract address = tokenContractAddress
      let tokenAddress = await blockchain.contractCall(verifyContract, 'get_token_contract', []);
      expect(tokenAddress).to.equal(tokenContractAddress);

      ////////////////////////////////////////////////////////////
      // change owner to testAccount
      await blockchain.sendTransaction(verifyContract, 'set_owner', verifyPrivateKey, [testAccount]);
      // expect contract owner = testAccount
      let currentContractOwner = await blockchain.contractCall(verifyContract, 'get_owner', []);
      expect(currentContractOwner).to.equal(testAccount);

      // change token contract to {{contractAccount}}
      await blockchain.sendTransaction(verifyContract, 'set_token_contract', testAccountPrivateKey, [tempTokenContractAddress]);

      // expect token contract address = {{contractAccount}}
      let currentTokenAddress = await blockchain.contractCall(verifyContract, 'get_token_contract', []);
      expect(currentTokenAddress).to.equal(tempTokenContractAddress);

    } catch (e) {
      console.error(e);
    }
  });

});