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

import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function detectBuildSha(): string {
  if (process.env.NEXT_PUBLIC_PORTAL_BUILD_SHA) return process.env.NEXT_PUBLIC_PORTAL_BUILD_SHA;
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PORTAL_BUILD_SHA: detectBuildSha(),
  },
  // msw uses Node-native http internals via subpath exports such as
  // "@mswjs/interceptors/ClientRequest". Webpack's bundler cannot resolve
  // those subpaths with the "browser" export condition, so we tell Next.js
  // to treat these packages as external (loaded via Node require at runtime
  // rather than bundled). The regex covers both msw itself and the entire
  // @mswjs/* scope.
  serverExternalPackages: ["msw", "@mswjs/interceptors"],
  webpack(config, { isServer }) {
    if (isServer) {
      // Extend any existing externals with a function that externalises the
      // msw Node-server bundle and all @mswjs/* sub-packages so webpack
      // never tries to bundle their Node-only internals.
      const prev = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(prev) ? prev : [prev]),
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (request && /^(msw\/node|@mswjs\/)/.test(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
