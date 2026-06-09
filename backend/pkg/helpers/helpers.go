package helpers

import (
	"encoding/json"
	"net/http"
)

type APIResponse struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	RequestID string      `json:"request_id,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, success bool, message string, data interface{}, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	
	resp := APIResponse{
		Success:   success,
		Message:   message,
		Data:      data,
		RequestID: requestID,
	}
	
	json.NewEncoder(w).Encode(resp)
}

func WriteError(w http.ResponseWriter, status int, message string, requestID string) {
	WriteJSON(w, status, false, message, nil, requestID)
}
