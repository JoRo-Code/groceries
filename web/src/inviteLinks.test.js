import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationToken, invitationOrigin} from './inviteLinks.js';
const token='a'.repeat(72);
test('old and new invitations work across both app origins',()=>{
  for(const current of ['https://app.palisty.com','https://groceries-ros.web.app']) {
    for(const origin of ['https://app.palisty.com','https://groceries-ros.web.app','https://groceries-ros.firebaseapp.com']) {
      assert.equal(invitationToken(`${origin}/join/${token}`,current),token);
    }
    assert.equal(invitationToken(`/join/${token}`,current),token);
  }
});
test('reject unrelated, lookalike, insecure and malformed invitation links',()=>{
  for(const url of [`https://evil.example/join/${token}`,`https://app.palisty.com.evil.example/join/${token}`,`http://app.palisty.com/join/${token}`,`https://user@app.palisty.com/join/${token}`,`https://palisty.com/join/${token}`,`https://app.palisty.com/join/short`]) {
    assert.throws(()=>invitationToken(url,'https://groceries-ros.web.app'));
  }
});
test('new-domain invitations remain on that domain with safe default outside app',()=>{
  assert.equal(invitationOrigin('groceries-ros','https://app.palisty.com'),'https://app.palisty.com');
  assert.equal(invitationOrigin('groceries-ros','https://groceries-ros.web.app'),'https://groceries-ros.web.app');
  assert.equal(invitationOrigin('groceries-ros',undefined),'https://groceries-ros.web.app');
  assert.equal(invitationOrigin('groceries-ros','https://evil.example'),'https://groceries-ros.web.app');
});
