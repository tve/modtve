// Copyright © 2023 by Thorsten von Eicken
#include "esp_common/include/esp_check.h"
#include "esp_system/include/esp_task_wdt.h"
#include "xsHost.h"
#include "xsmc.h"
#include "mc.xs.h" // for xsID_* constants

#define xsmcVar(x) xsVar(x)

static uint32_t timeout_ms;

typedef struct {
  esp_task_wdt_user_handle_t handle;
} wdt_data;

void xs_wdt_get_timeout_ms(xsMachine *the) {
  xsmcSetInteger(xsResult, timeout_ms);
}

void xs_wdt_set_timeout_ms(xsMachine *the) {
  int32_t to = xsmcToInteger(xsArg(0));
  esp_task_wdt_config_t conf = {
    .timeout_ms = to,
    .idle_core_mask = (1<<CONFIG_SOC_CPU_CORES_NUM)-1, // subscribe idle tasks of all cores
    .trigger_panic = true,
  };
  esp_err_t err = esp_task_wdt_reconfigure(&conf);
  if (err != ESP_OK)
    xsUnknownError("can't set timeout");
  timeout_ms = to;
}

void xs_wdt_init(xsMachine *the) {
  #ifdef CONFIG_ESP_TASK_WDT_TIMEOUT_S
    timeout_ms = CONFIG_ESP_TASK_WDT_TIMEOUT_S * 1000;
  #else
    timeout_ms = 5000; // esp-idf default value
  #endif
}

void xs_wdt_constructor(xsMachine *the) {
  if (xsmcArgc != 1) xsUnknownError("invalid arguments");

	wdt_data *data = xsmcSetHostChunk(xsThis, NULL, sizeof(wdt_data));

  // if the task wdt isn't initialized do that now
  // esp_err_t err0 = esp_task_wdt_status(NULL);
  // if (err0 != ESP_OK) {
  //   esp_task_wdt_init(NULL); // fixme: can't use NULL!!!
  // }

  char *name = xsmcToString(xsArg(0));
  esp_err_t err = esp_task_wdt_add_user(name, &data->handle); // name is copied by esp-idf
  if (err != ESP_OK) {
    int l = strlen("can't add user: ");
    const char *esp_err = esp_err_to_name(err);
    l += strlen(esp_err);
    char *msg = c_malloc(l+1);
    strcpy(msg, "can't add user: ");
    strcat(msg, esp_err);
    xsUnknownError(msg);
  }
}

void xs_wdt_destructor(void *hostData) {
  wdt_data *data = hostData;
  if (data->handle != NULL)
    esp_task_wdt_delete_user(data->handle);
  c_free(data);
}

void xs_wdt_close(xsMachine *the) {
  wdt_data *data = xsmcGetHostChunk(xsThis);
  if (data->handle != NULL) {
    esp_task_wdt_delete_user(data->handle);
    data->handle = NULL;
  }
}

void xs_wdt_write(xsMachine *the) {
  wdt_data *data = xsmcGetHostChunk(xsThis);
  if (data->handle != NULL) {
    esp_task_wdt_reset_user(data->handle);
  }
}
