// Arto line protocol v1. Host metadata stays off the 2 KB Uno SRAM.
#include <Arduino.h>
#include <stdio.h>

char buffer[64];
uint8_t used = 0;
bool overflowed = false;
bool outputs[20] = {false};
unsigned long lastContact = 0;
bool tripped = false;
struct Interlock { uint8_t input; uint8_t output; uint8_t blocked; };
Interlock interlocks[8];
uint8_t interlockCount = 0;

bool blocked(uint8_t output) {
  for (uint8_t i = 0; i < interlockCount; i++) {
    if (interlocks[i].output == output && digitalRead(interlocks[i].input) == interlocks[i].blocked) return true;
  }
  return false;
}

void stopOutputs() {
  for (uint8_t pin = 2; pin < 20; pin++) {
    if (outputs[pin]) digitalWrite(pin, LOW);
  }
}

void reply(unsigned long id, bool ok, int value, const char *error = "invalid_command") {
  Serial.print(F("{\"id\":")); Serial.print(id);
  if (ok) {
    Serial.print(F(",\"ok\":true,\"value\":")); Serial.print(value);
    Serial.println(F(",\"protocol\":1}"));
  } else {
    Serial.print(F(",\"ok\":false,\"error\":\"")); Serial.print(error); Serial.println(F("\"}"));
  }
}

void execute() {
  unsigned long id = 0;
  char op = 0, extra = 0;
  int pin = -1, value = -1;
  int level = -1;
  if (sscanf(buffer, "%lu %c %d %d %d %c", &id, &op, &pin, &value, &level, &extra) == 5 && op == 'i') {
    if (pin < 2 || pin > 19 || value < 2 || value > 19 || level < 0 || level > 1 || interlockCount >= 8 || !outputs[value] || outputs[pin]) { reply(id, false, 0, "invalid_interlock"); return; }
    interlocks[interlockCount++] = { (uint8_t)pin, (uint8_t)value, (uint8_t)level };
    lastContact = millis(); reply(id, true, interlockCount); return;
  }
  int count = sscanf(buffer, "%lu %c %d %d %c", &id, &op, &pin, &value, &extra);
  if (count < 2 || count == 5) { reply(id, false, 0); return; }
  lastContact = millis(); tripped = false;
  if (op == 'h' && count == 2) { reply(id, true, 1); return; }
  if (op == 's' && count == 2) { stopOutputs(); reply(id, true, 0); return; }
  if (pin < 2 || pin > 19) { reply(id, false, 0, "invalid_pin"); return; }
  if (op == 'm' && count == 4 && value >= 0 && value <= 2) {
    pinMode(pin, value == 1 ? OUTPUT : value == 2 ? INPUT_PULLUP : INPUT);
    outputs[pin] = value == 1;
    if (outputs[pin]) digitalWrite(pin, LOW);
    reply(id, true, value); return;
  }
  if (op == 'r' && count == 3) { reply(id, true, digitalRead(pin)); return; }
  if (op == 'a' && count == 3 && pin >= 14) { reply(id, true, analogRead(pin)); return; }
  if (!outputs[pin]) { reply(id, false, 0, "pin_not_output"); return; }
  if ((op == 'w' || op == 'p') && value > 0 && blocked(pin)) { reply(id, false, 0, "interlock_active"); return; }
  if (op == 'w' && count == 4 && (value == 0 || value == 1)) {
    digitalWrite(pin, value); reply(id, true, digitalRead(pin)); return;
  }
  if (op == 'p' && count == 4 && value >= 0 && value <= 255 &&
      (pin == 3 || pin == 5 || pin == 6 || pin == 9 || pin == 10 || pin == 11)) {
    analogWrite(pin, value); reply(id, true, value); return;
  }
  reply(id, false, 0);
}

void setup() { Serial.begin(115200); lastContact = millis(); }
void loop() {
  for (uint8_t i = 0; i < interlockCount; i++) {
    uint8_t pin = interlocks[i].output;
    if (blocked(pin) && digitalRead(pin) == HIGH) {
      digitalWrite(pin, LOW);
      Serial.print(F("{\"event\":\"interlock\",\"pin\":")); Serial.print(pin); Serial.println(F(",\"value\":0}"));
    }
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      buffer[used] = 0;
      if (!overflowed) execute();
      else reply(0, false, 0, "line_too_long");
      used = 0; overflowed = false;
    } else if (c != '\r') {
      if (used < sizeof(buffer) - 1) buffer[used++] = c;
      else overflowed = true;
    }
  }
  if (!tripped && millis() - lastContact > 5000) {
    stopOutputs(); tripped = true;
    Serial.println(F("{\"event\":\"watchdog\"}"));
  }
}
