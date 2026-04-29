// ============================================================================
// COMMUNICATION HUB (CH) - FIRMWARE WITH ALARM FLAG
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <esp_now.h>
#include "esp_camera.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ============ CONFIGURATION ============
const char* ssid     = "MyOptimum 88910f";
const char* password = "garnet-33-9732";
#define BOTtoken "8623394343:AAE8TgBpRUNBcMr_WRYwt3GMmZK_A8RIzjc"
#define CHAT_ID  "5488373746"

// ============ PIN DEFINITIONS ============
const int PIR_SENSOR    = 21;
const int IR_SENSOR     = 20;
const int BUZZER_PIN    = 2;
const int LED_PIN       = 47;
const int ARM_BUTTON    = 14;
const int SDA_PIN       = 42;
const int SCL_PIN       = 41;

// ============ DEVICE CONFIGURATION ============
uint8_t broadcastAddress[] = {0xF4, 0x65, 0x0B, 0xD7, 0x86, 0x4C};
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============ CAMERA PINS ============
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  15
#define SIOD_GPIO_NUM  4
#define SIOC_GPIO_NUM  5
#define Y9_GPIO_NUM    16
#define Y8_GPIO_NUM    17
#define Y7_GPIO_NUM    18
#define Y6_GPIO_NUM    12
#define Y5_GPIO_NUM    10
#define Y4_GPIO_NUM    8
#define Y3_GPIO_NUM    9
#define Y2_GPIO_NUM    11
#define VSYNC_GPIO_NUM 6
#define HREF_GPIO_NUM  7
#define PCLK_GPIO_NUM  13

// ============ DATA STRUCTURES ============
struct CommandPacket {
  uint8_t  msgType;
  uint8_t  channel;
  uint8_t  state;
  uint32_t seq;
};

struct StatusPacket {
  uint8_t  msgType;
  uint32_t seq;
  uint8_t  online;
  uint8_t  channels[6];
  float    voltages[6];
  char     pdFault[32];
};

// ============ STATE VARIABLES ============
uint32_t seqCounter = 1;
WiFiClientSecure secureClient;
UniversalTelegramBot bot(BOTtoken, secureClient);

bool armed = true;
bool pirTriggered = false;
bool alarmActive = false;
volatile bool channelStates[6] = {false, false, false, false, false, false};
volatile float pdVoltages[6] = {0, 0, 0, 0, 0, 0};
bool pdOnline = false;

// ============ TIMERS ============
unsigned long lastTriggerTime = 0;
const unsigned long TRIGGER_COOLDOWN = 20000;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 10000;
unsigned long lastButtonPress = 0;
const unsigned long BUTTON_DEBOUNCE = 300;
unsigned long lastLcdUpdate = 0;
const unsigned long LCD_UPDATE_INTERVAL = 1000;

WebServer server(80);

// ============ HELPER FUNCTIONS ============

void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  Serial.printf("ESP-NOW: %s\n", status == ESP_NOW_SEND_SUCCESS ? "Success" : "Failed");
}

void onDataRecv(const esp_now_recv_info_t* recvInfo, const uint8_t* data, int len) {
  StatusPacket pkt;
  memset(&pkt, 0, sizeof(pkt));
  int copyLen = (len < (int)sizeof(StatusPacket)) ? len : (int)sizeof(StatusPacket);
  if (copyLen > 0) memcpy(&pkt, data, copyLen);

  if (pkt.msgType != 2) return;

  pdOnline = ([pkt.online](http://pkt.online) == 1);
  for (int i = 0; i < 6; i++) {
    channelStates[i] = (pkt.channels[i] == 1);
    pdVoltages[i] = pkt.voltages[i];
  }
}

void initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  [config.pin](http://config.pin)_d0 = Y2_GPIO_NUM;
  [config.pin](http://config.pin)_d1 = Y3_GPIO_NUM;
  [config.pin](http://config.pin)_d2 = Y4_GPIO_NUM;
  [config.pin](http://config.pin)_d3 = Y5_GPIO_NUM;
  [config.pin](http://config.pin)_d4 = Y6_GPIO_NUM;
  [config.pin](http://config.pin)_d5 = Y7_GPIO_NUM;
  [config.pin](http://config.pin)_d6 = Y8_GPIO_NUM;
  [config.pin](http://config.pin)_d7 = Y9_GPIO_NUM;
  [config.pin](http://config.pin)_xclk = XCLK_GPIO_NUM;
  [config.pin](http://config.pin)_pclk = PCLK_GPIO_NUM;
  [config.pin](http://config.pin)_vsync = VSYNC_GPIO_NUM;
  [config.pin](http://config.pin)_href = HREF_GPIO_NUM;
  [config.pin](http://config.pin)_sccb_sda = SIOD_GPIO_NUM;
  [config.pin](http://config.pin)_sccb_scl = SIOC_GPIO_NUM;
  [config.pin](http://config.pin)_pwdn = PWDN_GPIO_NUM;
  [config.pin](http://config.pin)_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err == ESP_OK) {
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);
    Serial.println("Camera: OK");
  } else {
    Serial.printf("Camera: FAILED (0x%X)\n", err);
  }
}

bool sendPhotoTelegram() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return false;

  WiFiClientSecure client;
  client.setInsecure();
  if (!client.connect("[api.telegram.org](http://api.telegram.org)", 443)) {
    esp_camera_fb_return(fb);
    return false;
  }

  String head = "--Abacus\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + String(CHAT_ID) +
                "\r\n--Abacus\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"alert.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  String tail = "\r\n--Abacus--\r\n";
  uint32_t totalLen = head.length() + fb->len + tail.length();

  client.println("POST /bot" + String(BOTtoken) + "/sendPhoto HTTP/1.1");
  client.println("Host: [api.telegram.org](http://api.telegram.org)");
  client.println("Content-Length: " + String(totalLen));
  client.println("Content-Type: multipart/form-data; boundary=Abacus");
  client.println();
  client.print(head);

  for (size_t n = 0; n < fb->len; n += 1024) {
    size_t chunk = ((n + 1024) < fb->len) ? 1024 : (fb->len - n);
    client.write(fb->buf + n, chunk);
  }

  client.print(tail);
  esp_camera_fb_return(fb);
  return true;
}

void sendCommandToPD(uint8_t channel, bool state) {
  CommandPacket cmd;
  cmd.msgType = 1;
  [cmd.channel](http://cmd.channel) = channel;
  cmd.state = state ? 1 : 0;
  cmd.seq = seqCounter++;
  esp_now_send(broadcastAddress, (uint8_t*)&cmd, sizeof(cmd));
  Serial.printf("CMD: CH%d=%s\n", channel, state ? "ON" : "OFF");
}

void updateLcd() {
  lcd.clear();
  lcd.setCursor(0, 0);

  if (armed) {
    lcd.print("ARMED           ");
    bool pir = (digitalRead(PIR_SENSOR) == LOW);
    bool ir = (digitalRead(IR_SENSOR) == LOW);
    lcd.setCursor(0, 1);
    lcd.print("P:"); lcd.print(pir ? "TRIG " : "OK   ");
    lcd.print("I:"); lcd.print(ir ? "TRIG" : "OK  ");
  } else {
    lcd.print("DISARMED        ");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.status() == WL_CONNECTED ? "WiFi: ONLINE    " : "WiFi: OFFLINE   ");
  }
}

void triggerAlarm() {
  lastTriggerTime = millis();
  alarmActive = true;

  lcd.clear();
  lcd.print("!!! INTRUDER !!!");
  lcd.setCursor(0, 1);
  lcd.print("DUAL-CONFIRMED");

  sendCommandToPD(0, false);

  // Brief alert pulse: 200ms buzzer
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  if (WiFi.status() == WL_CONNECTED) {
    bot.sendMessage(CHAT_ID, "⚠️ INTRUSION ALERT! System SHUTDOWN. Sending photo...", "");
    sendPhotoTelegram();
  }

  // Clear alarm flag after 5 seconds
  delay(5000);
  alarmActive = false;

  updateLcd();
}

// ============ WEB SERVER HANDLERS ============

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleRoot() {
  addCorsHeaders();
  server.send(200, "text/plain", "CH Online");
}

void handleTelemetry() {
  addCorsHeaders();

  int activeChannels = 0;
  for (int i = 0; i < 6; i++) if (channelStates[i]) activeChannels++;

  String json = "{";
  json += "\"alarmActive\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"voltage\":" + String(pdVoltages[0], 2) + ",";
  json += "\"signalStrength\":" + String(WiFi.RSSI()) + ",";
  json += "\"securityState\":\"" + String(armed ? "armed" : "disarmed") + "\",";
  json += "\"pdOnline\":" + String(pdOnline ? "true" : "false") + ",";

  for (int i = 0; i < 6; i++) {
    json += "\"channel" + String(i + 1) + "\":" + String(channelStates[i] ? "true" : "false") + ",";
    json += "\"voltage" + String(i + 1) + "\":" + String(pdVoltages[i], 2);
    if (i < 5) json += ",";
  }

  json += "}";
  server.send(200, "application/json", json);
}

void handleChannelRequest() {
  addCorsHeaders();
  String uri = server.uri();
  int p1 = uri.indexOf('/', 1);
  int p2 = uri.indexOf('/', p1 + 1);

  if (!uri.startsWith("/channel/") || p2 < 0) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }

  int channel = uri.substring(p1 + 1, p2).toInt();
  bool state = (uri.substring(p2 + 1) == "on");

  if (channel < 1 || channel > 6) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }

  sendCommandToPD(channel, state);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleKill() {
  addCorsHeaders();
  sendCommandToPD(0, false);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleRestore() {
  addCorsHeaders();
  sendCommandToPD(0, true);
  server.send(200, "application/json", "{\"ok\":true}");
}

// ============ WEBSOCKET HANDLER ============


// ============ SETUP ============

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("SYSTEM STARTING");

  pinMode(PIR_SENSOR, INPUT_PULLUP);
  pinMode(IR_SENSOR, INPUT_PULLUP);
  pinMode(ARM_BUTTON, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  delay(2000);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.println("WiFi: Connecting...");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi: OK" : "\nWiFi: FAILED");

  if (esp_now_init() == ESP_OK) {
    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(onDataRecv);
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, broadcastAddress, 6);
    [peerInfo.channel](http://peerInfo.channel) = 0;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);
    Serial.println("ESP-NOW: OK");
  } else {
    Serial.println("ESP-NOW: FAILED");
  }

  initCamera();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.on("/channel/1/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/1/off", HTTP_GET, handleChannelRequest);
  server.on("/channel/2/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/2/off", HTTP_GET, handleChannelRequest);
  server.on("/channel/3/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/3/off", HTTP_GET, handleChannelRequest);
  server.on("/channel/4/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/4/off", HTTP_GET, handleChannelRequest);
  server.on("/channel/5/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/5/off", HTTP_GET, handleChannelRequest);
  server.on("/channel/6/on", HTTP_GET, handleChannelRequest);
  server.on("/channel/6/off", HTTP_GET, handleChannelRequest);
  server.on("/kill", HTTP_GET, handleKill);
  server.on("/restore", HTTP_GET, handleRestore);

  server.begin();
  Serial.println("Server: Started");
  updateLcd();
  Serial.println("=== SYSTEM READY ===");
}

// ============ MAIN LOOP ============

void loop() {
  server.handleClient();

  // WiFi Check
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      lcd.setCursor(0, 1);
      lcd.print("WiFi: OFFLINE   ");
    }
  }

  // LCD Update
  if (armed && millis() - lastLcdUpdate > LCD_UPDATE_INTERVAL) {
    lastLcdUpdate = millis();
    updateLcd();
  }

  // ARM/DISARM Button
  if (digitalRead(ARM_BUTTON) == LOW && millis() - lastButtonPress > BUTTON_DEBOUNCE) {
    lastButtonPress = millis();
    armed = !armed;

    if (armed) {
      Serial.println(">>> ARMED <<<");
      digitalWrite(BUZZER_PIN, HIGH); digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(BUZZER_PIN, LOW); digitalWrite(LED_PIN, LOW);
      delay(100);
      digitalWrite(BUZZER_PIN, HIGH); digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(BUZZER_PIN, LOW); digitalWrite(LED_PIN, LOW);
    } else {
      Serial.println(">>> DISARMED <<<");
      digitalWrite(BUZZER_PIN, HIGH); digitalWrite(LED_PIN, HIGH);
      delay(500);
      digitalWrite(BUZZER_PIN, LOW); digitalWrite(LED_PIN, LOW);
    }
    updateLcd();
  }

  // PIR & IR Detection
  bool pir = (digitalRead(PIR_SENSOR) == LOW);
  bool ir = (digitalRead(IR_SENSOR) == LOW);

  if (pir) {
    pirTriggered = true;
  }

  // Trigger alarm
  if (pirTriggered && ir && armed && (millis() - lastTriggerTime > TRIGGER_COOLDOWN)) {
    delay(200);
    bool confirmIr = (digitalRead(IR_SENSOR) == LOW);
    if (confirmIr) {
      triggerAlarm();
      pirTriggered = false;
    }
  }

  yield();
}
