#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# CORRECT FILENAME HERE
JSON_FILE="features.json"

# Check if jq is installed (should be by Dockerfile)
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq."
    exit 1
fi

# Check if the correct features.json exists
if [ ! -f "$JSON_FILE" ]; then
  echo "Error: Features file '$JSON_FILE' not found in $(pwd)!"
  exit 1
fi

echo "Processing repositories from $JSON_FILE"
# Read the repositories array from the CORRECT file
jq -c '.repositories[]' "$JSON_FILE" | while IFS= read -r repo_data; do
  REPO_URL=$(echo "$repo_data" | jq -r '.repos')
  BRANCH=$(echo "$repo_data" | jq -r '.branch // ""') # Handle null branch gracefully
  OUTPUT_FOLDER=$(echo "$repo_data" | jq -r '.outputFolder')

  if [ -z "$OUTPUT_FOLDER" ] || [ "$OUTPUT_FOLDER" == "null" ]; then
    echo "Error: outputFolder missing or null for repo $REPO_URL in $JSON_FILE"
    exit 1
  fi

  # Ensure parent directory exists if needed (e.g., for custom_nodes)
  mkdir -p "$(dirname "$OUTPUT_FOLDER")"

  echo "Cloning repository: $REPO_URL into $OUTPUT_FOLDER"
  # Consider adding --depth 1 if full history isn't needed to speed up clones
  git clone --quiet "$REPO_URL" "$OUTPUT_FOLDER" # Use --quiet for cleaner logs

  # Check if branch is specified and not null/empty
  if [ -n "$BRANCH" ] && [ "$BRANCH" != "null" ]; then
    echo "Checking out commit/branch: $BRANCH in $OUTPUT_FOLDER"
    # Use a subshell to avoid changing the main script's directory
    (cd "$OUTPUT_FOLDER" && git checkout --quiet "$BRANCH")
    if [ $? -ne 0 ]; then
        echo "Error checking out branch/commit $BRANCH for $REPO_URL. Continuing..."
        # Decide if you want to exit or continue if checkout fails
        # exit 1 # Uncomment to exit on error
    fi
  else
    echo "Using default branch for $REPO_URL"
  fi
done || { echo "Error processing repositories with jq."; exit 1; } # Added error check for jq pipe

echo "Finished cloning repositories."

# Download models from features.json
echo "Processing model downloads from $JSON_FILE"

# Function to download a model
download_model() {
    local url="$1"
    local destination="$2"
    local filename="$3"

    local full_path="ComfyUI/${destination}/${filename}"

    # Create destination directory if it doesn't exist
    mkdir -p "ComfyUI/${destination}"

    if [ -f "$full_path" ]; then
        echo "Model already exists: $full_path, skipping download"
        return 0
    fi

    echo "Downloading $filename to ComfyUI/${destination}/"

    # Check if URL is from HuggingFace and if HF_TOKEN is set
    if [[ "$url" == *"huggingface.co"* ]] && [ -n "$HF_TOKEN" ]; then
        echo "Using HuggingFace authentication for download..."
        wget -q --show-progress --header="Authorization: Bearer $HF_TOKEN" -O "$full_path" "$url"
    else
        wget -q --show-progress -O "$full_path" "$url"
    fi

    if [ $? -eq 0 ]; then
        echo "Successfully downloaded: $filename"
    else
        echo "Warning: Failed to download $filename from $url"
    fi
}

# Download VAE models
echo "Downloading VAE models..."
jq -c '.models.vae[]? // empty' "$JSON_FILE" 2>/dev/null | while IFS= read -r model_data; do
    url=$(echo "$model_data" | jq -r '.url')
    destination=$(echo "$model_data" | jq -r '.destination')
    filename=$(echo "$model_data" | jq -r '.filename')
    download_model "$url" "$destination" "$filename"
done

# Download CLIP models
echo "Downloading CLIP models..."
jq -c '.models.clip[]? // empty' "$JSON_FILE" 2>/dev/null | while IFS= read -r model_data; do
    url=$(echo "$model_data" | jq -r '.url')
    destination=$(echo "$model_data" | jq -r '.destination')
    filename=$(echo "$model_data" | jq -r '.filename')
    download_model "$url" "$destination" "$filename"
done

# Download diffusion models
echo "Downloading diffusion models..."
jq -c '.models.diffusion_models[]? // empty' "$JSON_FILE" 2>/dev/null | while IFS= read -r model_data; do
    url=$(echo "$model_data" | jq -r '.url')
    destination=$(echo "$model_data" | jq -r '.destination')
    filename=$(echo "$model_data" | jq -r '.filename')
    download_model "$url" "$destination" "$filename"
done

echo "Finished downloading models."