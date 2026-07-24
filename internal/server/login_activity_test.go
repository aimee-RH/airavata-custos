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
	"strings"
	"testing"

	"github.com/apache/airavata-custos/pkg/identity"
)

func TestTrustedLoginEventUsesVerifiedTokenClaims(t *testing.T) {
	caller := &identity.Caller{
		UserID: "user-1", Issuer: "issuer", Subject: "subject",
		SessionID: "shared-sso-session", AuthTime: 1_749_999_000,
		TokenID: "token-id", IssuedAt: 1_750_000_000,
	}
	input, err := trustedLoginEvent(caller, recordLoginEventRequest{})
	if err != nil {
		t.Fatal(err)
	}
	wantKey := hashedEventKey("token", "issuer", "subject", "token-id", 1_750_000_000)
	if input.EventKey != wantKey || input.SessionID != "token-id" || input.OccurredAt.Unix() != 1_750_000_000 {
		t.Fatalf("unexpected input: %+v", input)
	}
	if strings.Contains(input.EventKey, "issuer") || strings.Contains(input.EventKey, "subject") || strings.Contains(input.EventKey, "token-id") {
		t.Fatalf("event key leaks verified claim values: %q", input.EventKey)
	}
}

func TestTrustedLoginEventDistinguishesPortalCallbacksWithinOneSSOSession(t *testing.T) {
	first, err := trustedLoginEvent(&identity.Caller{
		UserID: "user-1", Issuer: "issuer", Subject: "subject",
		SessionID: "shared-sso-session", AuthTime: 1_749_999_000,
		TokenID: "token-1", IssuedAt: 1_750_000_000,
	}, recordLoginEventRequest{})
	if err != nil {
		t.Fatal(err)
	}
	second, err := trustedLoginEvent(&identity.Caller{
		UserID: "user-1", Issuer: "issuer", Subject: "subject",
		SessionID: "shared-sso-session", AuthTime: 1_749_999_000,
		TokenID: "token-2", IssuedAt: 1_750_000_001,
	}, recordLoginEventRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if first.EventKey == second.EventKey {
		t.Fatal("independent portal callbacks within one IdP SSO session must be distinct")
	}
}

func TestTrustedLoginEventFallsBackToVerifiedSessionClaims(t *testing.T) {
	input, err := trustedLoginEvent(&identity.Caller{
		UserID: "user-1", Issuer: "issuer", Subject: "subject",
		SessionID: "sid", AuthTime: 1_750_000_000,
	}, recordLoginEventRequest{})
	if err != nil {
		t.Fatal(err)
	}
	wantKey := hashedEventKey("session", "issuer", "subject", "sid", 1_750_000_000)
	if input.EventKey != wantKey || input.SessionID != "sid" || input.OccurredAt.Unix() != 1_750_000_000 {
		t.Fatalf("unexpected fallback input: %+v", input)
	}
}

func TestTrustedLoginEventRejectsIncompleteEvidence(t *testing.T) {
	_, err := trustedLoginEvent(&identity.Caller{UserID: "user-1", Issuer: "issuer", Subject: "subject"}, recordLoginEventRequest{})
	if err == nil {
		t.Fatal("expected incomplete session evidence to be rejected")
	}
}
