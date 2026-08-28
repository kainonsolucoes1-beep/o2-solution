"""Cliente S3-compatível para o bucket de anexos no Cloudflare R2."""
import os
from typing import BinaryIO, Optional

import boto3
from botocore.client import Config

_BUCKET = os.getenv("R2_BUCKET_NAME")
_ENDPOINT = os.getenv("R2_ENDPOINT")
_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=_ENDPOINT,
            aws_access_key_id=_ACCESS_KEY_ID,
            aws_secret_access_key=_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _client


def upload_file(key: str, fileobj: BinaryIO, content_type: Optional[str] = None) -> None:
    extra_args = {"ContentType": content_type} if content_type else {}
    _get_client().upload_fileobj(fileobj, _BUCKET, key, ExtraArgs=extra_args)


def delete_file(key: str) -> None:
    _get_client().delete_object(Bucket=_BUCKET, Key=key)


def presigned_download_url(key: str, file_name: str, expires_in: int = 300) -> str:
    return _get_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": _BUCKET,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{file_name}"',
        },
        ExpiresIn=expires_in,
    )
