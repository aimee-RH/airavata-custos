// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

package server

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/apache/airavata-custos/pkg/common"
	"github.com/apache/airavata-custos/pkg/identity"
	"github.com/apache/airavata-custos/pkg/service"
)

type recordLoginEventRequest struct{}

func (s *Server) recordLoginEvent(w http.ResponseWriter, r *http.Request) {
	caller := requireCaller(w, r)
	if caller == nil {
		return
	}

	var req recordLoginEventRequest
	if err := common.DecodeJSON(r, &req); err != nil {
		common.WriteError(w, http.StatusBadRequest, err)
		return
	}
	input, err := trustedLoginEvent(caller, req)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, fmt.Errorf("%w: %v", service.ErrInvalidInput, err))
		return
	}
	result, err := s.svc.RecordLoginEvent(r.Context(), caller.UserID, input)
	if err != nil {
		common.WriteServiceError(w, err)
		return
	}
	status := http.StatusCreated
	if !result.Recorded {
		status = http.StatusOK
	}
	common.WriteJSON(w, status, result)
}

func trustedLoginEvent(caller *identity.Caller, req recordLoginEventRequest) (service.RecordLoginEventInput, error) {
	if caller == nil || caller.UserID == "" || caller.Issuer == "" || caller.Subject == "" {
		return service.RecordLoginEventInput{}, fmt.Errorf("verified issuer and subject are required")
	}
	// A freshly issued token identifies this OIDC callback more accurately than
	// sid/auth_time: an IdP SSO session may be reused across multiple independent
	// portal sessions, while this portal does not perform token refreshes.
	if caller.TokenID != "" && caller.IssuedAt > 0 {
		return service.RecordLoginEventInput{
			EventKey:   hashedEventKey("token", caller.Issuer, caller.Subject, caller.TokenID, caller.IssuedAt),
			OccurredAt: time.Unix(caller.IssuedAt, 0).UTC(),
			Provider:   "oidc",
			SessionID:  caller.TokenID,
		}, nil
	}
	if caller.SessionID == "" || caller.AuthTime == 0 {
		return service.RecordLoginEventInput{}, fmt.Errorf("verified session identity is incomplete")
	}
	return service.RecordLoginEventInput{
		EventKey:   hashedEventKey("session", caller.Issuer, caller.Subject, caller.SessionID, caller.AuthTime),
		OccurredAt: time.Unix(caller.AuthTime, 0).UTC(),
		Provider:   "oidc",
		SessionID:  caller.SessionID,
	}, nil
}

func hashedEventKey(kind, issuer, subject, sessionID string, timestamp int64) string {
	canonical := fmt.Sprintf("v1\x00%s\x00%s\x00%s\x00%s\x00%d", kind, issuer, subject, sessionID, timestamp)
	digest := sha256.Sum256([]byte(canonical))
	return "v1:" + hex.EncodeToString(digest[:])
}
