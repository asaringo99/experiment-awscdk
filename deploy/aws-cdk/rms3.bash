#!/bin/bash

# すべてのS3バケットを取得してループ
for bucket in $(aws s3api list-buckets --query "Buckets[].Name" --output text); do
  echo "Processing bucket: $bucket"

  # バケット内の全オブジェクトを削除
  echo "Removing all objects from bucket: $bucket"
  aws s3 rm s3://$bucket --recursive

  # バージョニングが有効な場合、すべてのバージョンも削除
  versions=$(aws s3api list-object-versions --bucket $bucket --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text)
  if [ -n "$versions" ]; then
    echo "Removing all versions from bucket: $bucket"
    while read -r key version; do
      if [ -n "$version" ]; then
        aws s3api delete-object --bucket $bucket --key "$key" --version-id "$version"
      fi
    done <<< "$versions"
  fi

  # バージョニングが有効な場合、すべての削除マーカーも削除
  delete_markers=$(aws s3api list-object-versions --bucket $bucket --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text)
  if [ -n "$delete_markers" ]; then
    echo "Removing all delete markers from bucket: $bucket"
    while read -r key version; do
      if [ -n "$version" ]; then
        aws s3api delete-object --bucket $bucket --key "$key" --version-id "$version"
      fi
    done <<< "$delete_markers"
  fi

  # マルチパートアップロードの破片を削除
  uploads=$(aws s3api list-multipart-uploads --bucket $bucket --query 'Uploads[].{Key:Key,UploadId:UploadId}' --output text)
  if [ -n "$uploads" ]; then
    echo "Aborting multipart uploads in bucket: $bucket"
    while read -r key upload_id; do
      if [ -n "$upload_id" ]; then
        aws s3api abort-multipart-upload --bucket $bucket --key "$key" --upload-id "$upload_id"
      fi
    done <<< "$uploads"
  fi

  # バケットを削除
  echo "Deleting bucket: $bucket"
  aws s3api delete-bucket --bucket $bucket
done
