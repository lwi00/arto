import test from 'node:test';
import assert from 'node:assert/strict';
import { Fleet } from '../../applications/metro/server/fleet.ts';
import { createFleetServer } from '../../applications/metro/server/fleet-mcp.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

test('Onboard interlock, scoped train MCP and PCC clearance control actual firmware', async () => {
  const fleet = new Fleet({trainCount:2});
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name:'isolation-test', version:'1' });
  const server = createFleetServer(fleet,'rame_a');
  try {
    await fleet.start(); await server.connect(serverSide); await client.connect(clientSide);
    await fleet.inject('rame_a','partial');
    assert.equal((await fleet.device('rame_a').read('traction')).value,0);
    assert.equal(fleet.train('rame_a').observedTraction,0);
    assert.equal((await fleet.device('rame_b').read('traction')).value,1);
    assert.ok(!(await client.listTools()).tools.some(t=>t.name==='authorize_departure'));
    const attempted = await client.callTool({name:'set_component',arguments:{component:'traction',value:1}});
    assert.equal(attempted.isError,true);
    // A central clearance cannot override a remaining local fault.
    fleet.authorize('rame_a','Controller verification');
    await assert.rejects(fleet.traction('rame_a','depart','Test'),/interlock_active/);
    await fleet.resolve('rame_a');
    assert.equal(fleet.train('rame_a').incident?.status,'active');
    await assert.rejects(fleet.traction('rame_a','depart','Test'),/interlock_active/);
    await fleet.resolve('rame_a');
    fleet.train('rame_a').clearance=null;
    await assert.rejects(fleet.traction('rame_a','depart','Test'),/PCC clearance/);
    fleet.authorize('rame_a','Local conditions restored');
    await fleet.traction('rame_a','depart','PCC clearance received');
    assert.equal((await fleet.device('rame_a').read('traction')).value,1);
    assert.equal(fleet.train('rame_a').incident?.status,'resolved');
    await fleet.inject('rame_a','doors');
    await assert.rejects(fleet.traction('rame_a','depart','Old clearance'),/PCC clearance/);
    assert.equal((await fleet.device('rame_a').read('traction')).value,0);
  } finally { await client.close(); await server.close(); await fleet.close(); }
});
