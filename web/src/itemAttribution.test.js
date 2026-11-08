import test from 'node:test';
import assert from 'node:assert/strict';
import {itemActorName} from './itemAttribution.js';
test('attribution uses the current member name without exposing IDs',()=>{
 const members=[{id:'one',displayName:' Alex '},{id:'two'}];
 assert.equal(itemActorName('one',members,'me'),'Alex');
 assert.equal(itemActorName('two',members,'me'),'Medlem utan namn');
 assert.equal(itemActorName('me',members,'me'),'Du');
 assert.equal(itemActorName('removed',members,'me'),'Tidigare medlem');
 assert.equal(itemActorName(undefined,members,'me'),'Uppgift saknas');
});
test('roster loading and errors must not claim the member has left',()=>{
 assert.equal(itemActorName('one',[],'me','loading'),'Hämtar namn…');
 assert.equal(itemActorName('one',[],'me','error'),'Namnet kunde inte hämtas');
});
