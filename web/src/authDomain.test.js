import test from 'node:test';
import assert from 'node:assert/strict';
import {withAppAuthDomain} from './authDomain.js';
const config={projectId:'groceries-ros',authDomain:'groceries-ros.firebaseapp.com',appId:'existing'};
test('Palisty uses its own auth callback without changing project identity',()=>{
 assert.deepEqual(withAppAuthDomain(config,'app.palisty.com'),{...config,authDomain:'app.palisty.com'});
 assert.equal(config.authDomain,'groceries-ros.firebaseapp.com');
});
test('legacy, development and other-project apps retain their auth configuration',()=>{
 for(const host of ['groceries-ros.web.app','groceries-ros.firebaseapp.com','localhost',undefined,'app.palisty.com.evil.test'])assert.equal(withAppAuthDomain(config,host),config);
 const other={...config,projectId:'demo-handla'};
 assert.equal(withAppAuthDomain(other,'app.palisty.com'),other);
});
