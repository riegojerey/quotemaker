import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutFor, aboutTitle } from '../src/about.js';

test('default descriptions match service names from the Casa layout', () => {
  const cases = {
    'SMART LIGHTING': /lighting from anywhere/, 'SMART CLIMATE': /temperature remotely/, 'SMART COVERS': /natural light and privacy/,
    'SMART DOOR LOCK': /keyless entry/, 'SMART AUTOMATIC GATE': /License Plate Recognition/, 'VOICE COMMAND MODULE': /Alexa Echo/,
    'PRESENCE DETECTION': /detect your presence/, 'ENTRY AND ALARM SYSTEM': /Arm Away/, 'INTERACTIVE CONTROL PANEL': /3D-rendered floorplan/,
    'WIFI SYSTEM': /whole-home WiFi/, 'SURVEILLANCE CAMERA': /24\/7 monitoring/,
  };
  for (const [title, re] of Object.entries(cases)) assert.match(aboutFor(title), re, title);
});

test('services without a default description get none', () => {
  for (const t of ['GENERAL REQUIREMENTS', 'EXISTING CONDITION', 'SERVER AND NETWORK INSTALLATION', 'SMART FILM', 'SUPPLEMENTARY ELECTRICAL WIRINGS']) {
    assert.equal(aboutFor(t), '', t);
  }
});

test('display titles are friendly, not shouted', () => {
  assert.equal(aboutTitle('SMART DOOR LOCK'), 'Smart Door Lock');
  assert.equal(aboutTitle('WIFI SYSTEM'), 'WiFi System');
  assert.equal(aboutTitle('SURVEILLANCE CAMERA'), 'Surveillance Camera');
  assert.equal(aboutTitle('ENTRY AND ALARM SYSTEM'), 'Entry and Alarm System');
});
