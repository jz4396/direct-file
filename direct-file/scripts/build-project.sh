#!/usr/bin/env sh

# ----------------------------------------------------------------------------
# This script will build the project.
#
# It expects to be run from a repo that contains the `mvnw` script.
#
# ----------------------------------------------------------------------------

set -e

../scripts/build-dependencies.sh

# The backend's SubmissionBlockingFactsTest compares the server's submission-blocking facts with the client's
# generated list (df-client/df-client-app/src/fact-dictionary/generated/submissionBlockingFacts.ts). That file is
# gitignored, and the test fails when it is missing, so generate it before the backend build runs its tests.
if [ "$(basename "$(pwd)")" = "backend" ] && [ -d ../df-client/df-client-app ]; then
  echo 'generating the client fact dictionary for the backend tests...'
  (cd ../df-client/df-client-app && npm ci && npm run generate-fact-dictionary)
fi

echo 'cleaning, compiling and packaging /'$(pwd)'...'
./mvnw clean package