#!/usr/bin/env bash

set -e

: "${MEF_REPO?Path to MeF SDK repo}"

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
cd "$SCRIPT_DIR"

api_build_image_tag="direct-file-api-builder"
api_build_container_name="direct-file-api-builder-container"
api_jar_file_name="directfile-api-0.0.1-SNAPSHOT.jar"
jar_output_path_component="target"

# The image build runs SubmissionBlockingFactsTest, which compares the server's submission-blocking facts with the
# client's generated list. That list is gitignored, so generate it fresh here and pass it in as a build context.
client_generated_dir="../df-client/df-client-app/src/fact-dictionary/generated"
echo 'generating the client fact dictionary for the backend tests...'
(cd ../df-client/df-client-app && npm ci && npm run generate-fact-dictionary)

# build jar
docker buildx build \
  --pull \
  --build-context factgraph-repo="../fact-graph-scala" \
  --build-context boms="../boms" \
  --build-context config="../config" \
  --build-context shared-libs="../libs" \
  --build-context scripts="../scripts" \
  --build-context mef-sdk-repo="$MEF_REPO" \
  --build-context client-generated="$client_generated_dir" \
  --build-arg MAVEN_OPTS="$MAVEN_OPTS" \
  --build-arg MAVEN_CLI_OPTS="$MAVEN_CLI_OPTS" \
  --tag "$api_build_image_tag" \
  --file Dockerfile-local \
  --target api-builder \
  "$@" \
  "$SCRIPT_DIR"

# extract jar to `./target`
mkdir -p "$SCRIPT_DIR/$jar_output_path_component"
docker container rm --force "$api_build_container_name" &>/dev/null
docker container create --name "$api_build_container_name" "$api_build_image_tag"
docker cp "$api_build_container_name":/build/$jar_output_path_component/"$api_jar_file_name" "$SCRIPT_DIR/$jar_output_path_component/$api_jar_file_name"
docker container rm --force "$api_build_container_name"

printf "\njarfile: %s\n" "$SCRIPT_DIR/$jar_output_path_component/$api_jar_file_name"
