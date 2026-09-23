"""
Shared helpers: token decryption, cuid generation, X API client, LLM client.
"""
import os
import time
import random
import string
import hashlib
from app.config import settings


# ── cuid-style ID generator (compatible with Prisma's cuid()) ─────────────────

_FINGERPRINT = hashlib.md5(os.urandom(16)).hexdigest()[:4]
_COUNTER = 0

def new_cuid() -> str:
    global _COUNTER
    _COUNTER = (_COUNTER + 1) % 2176782336
    ts = format(int(time.time() * 1000), "x")
    counter = format(_COUNTER, "x").zfill(8)
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"c{ts}{counter}{_FINGERPRINT}{rand}"


# ── AES-256-GCM token decryption (matches server/src/lib/crypto.ts) ────────────

def decrypt_token(ciphertext: str) -> str:
    """
    Expects iv:authTag:encrypted (all hex), as produced by the Express gateway:
    iv_hex:tag_hex:cipher_hex
    """
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted token format — expected iv:tag:ciphertext")
    iv_hex, tag_hex, enc_hex = parts
    key = bytes.fromhex(settings.encryption_key)
    iv = bytes.fromhex(iv_hex)
    tag = bytes.fromhex(tag_hex)
    enc = bytes.fromhex(enc_hex)

    # 1. Try standard cryptography.hazmat AESGCM
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        aesgcm = AESGCM(key)
        # AESGCM.decrypt expects ciphertext + auth_tag appended
        decrypted = aesgcm.decrypt(iv, enc + tag, None)
        return decrypted.decode("utf-8")
    except ImportError:
        pass
    except Exception as e:
        pass

    # 2. Try pycryptodome fallback
    try:
        from Crypto.Cipher import AES as _AES
        cipher = _AES.new(key, _AES.MODE_GCM, nonce=iv)
        cipher._mac_tag = tag  # type: ignore[attr-defined]
        decrypted = cipher.decrypt(enc)
        cipher.verify(tag)
        return decrypted.decode("utf-8")
    except Exception as e:
        raise ValueError(f"Token decryption failed: {e}") from e
