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

/**
 * Next.js instrumentation hook — runs once on the server when the app starts.
 *
 * In development with NEXT_PUBLIC_PORTAL_USE_MSW=true we start the MSW Node
 * server so that the /api/v1/[...path] proxy route's outbound fetch calls are
 * intercepted by the same mock handlers used in Vitest and the browser worker.
 *
 * msw and @mswjs/interceptors are listed in `serverExternalPackages` in
 * next.config.ts so webpack loads them via the Node.js runtime require() and
 * does not attempt to bundle their Node.js-native http internals.
 */
export async function register() {
  // Only activate in the Node.js server runtime (not Edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_PORTAL_USE_MSW !== "true") return;
  if (process.env.NODE_ENV === "production") return;

  const { setupServer } = await import("msw/node");
  const { handlers } = await import("@/mocks/handlers");

  const server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "bypass" });
  console.log("[MSW] Server-side mock server started ✓");
}
