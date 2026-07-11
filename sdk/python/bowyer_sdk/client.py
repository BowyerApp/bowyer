"""HTTP client for BOWYER's REST and MCP APIs. Standard library only."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional


class BowyerError(Exception):
    """Raised when the BOWYER API returns an error."""

    def __init__(self, message: str, status: Optional[int] = None, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.detail = detail


class BowyerClient:
    """Client for a BOWYER deployment.

    Args:
        base_url: Deployment URL. Defaults to https://bowyer.app
        wallet: Your wallet address - required for paid business tools.
        timeout: Request timeout in seconds.
    """

    def __init__(
        self,
        base_url: str = "https://bowyer.app",
        wallet: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.wallet = wallet
        self.timeout = timeout

    # ---------------- internals ----------------

    def _request(
        self,
        path: str,
        method: str = "GET",
        body: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as err:
            try:
                detail = json.loads(err.read().decode())
            except Exception:
                detail = None
            message = (detail or {}).get("error") or f"HTTP {err.code}"
            raise BowyerError(str(message), status=err.code, detail=detail) from err

    # ---------------- REST ----------------

    def list_businesses(self) -> list[dict]:
        """All businesses in the catalog (including user-launched ones)."""
        return self._request("/api/agents").get("agents", [])

    def list_businesses_by_owner(self, owner: str) -> list[dict]:
        """Businesses launched by a wallet."""
        query = urllib.parse.quote(owner)
        return self._request(f"/api/agents?owner={query}").get("agents", [])

    def launch_business(
        self,
        name: str,
        tagline: str,
        category: str,
        description: str,
        revenue_model: str = "Free",
        price_usd: float = 0,
        payout_address: Optional[str] = None,
        owner_address: Optional[str] = None,
        mcp_endpoint: Optional[str] = None,
    ) -> dict:
        """Launch a business. Paid businesses require payout_address."""
        return self._request(
            "/api/agents",
            method="POST",
            body={
                "name": name,
                "tagline": tagline,
                "category": category,
                "description": description,
                "revenueModel": revenue_model,
                "priceUsd": price_usd,
                "creatorSharePct": 90,
                "payoutAddress": payout_address,
                "ownerAddress": owner_address,
                "mcpEndpoint": mcp_endpoint,
            },
        )

    def list_subscriptions(self, subscriber: Optional[str] = None) -> list[dict]:
        """Subscriptions bought by a wallet (defaults to the client wallet)."""
        who = subscriber or self.wallet
        if not who:
            raise BowyerError("A subscriber wallet address is required")
        query = urllib.parse.quote(who)
        return self._request(f"/api/subscriptions?subscriber={query}").get(
            "subscriptions", []
        )

    def list_earnings(self, creator: Optional[str] = None) -> list[dict]:
        """Payments received by businesses a wallet owns."""
        who = creator or self.wallet
        if not who:
            raise BowyerError("A creator wallet address is required")
        query = urllib.parse.quote(who)
        return self._request(f"/api/subscriptions?creator={query}").get(
            "subscriptions", []
        )

    def subscribe(self, slug: str, tx_hash: Optional[str] = None) -> dict:
        """Subscribe to a business.

        Free businesses activate instantly. Paid businesses require tx_hash -
        the hash of your on-chain payment to the creator's payout address
        (verified server-side on Robinhood Chain).
        """
        if not self.wallet:
            raise BowyerError("Set wallet= on BowyerClient to subscribe")
        return self._request(
            "/api/subscriptions",
            method="POST",
            body={"slug": slug, "subscriber": self.wallet, "txHash": tx_hash},
        )

    def cancel_subscription(self, slug: str) -> dict:
        """Cancel an active subscription."""
        if not self.wallet:
            raise BowyerError("Set wallet= on BowyerClient to cancel")
        return self._request(
            "/api/subscriptions",
            method="DELETE",
            body={"slug": slug, "subscriber": self.wallet},
        )

    # ---------------- MCP ----------------

    def agent(self, slug: str) -> "BowyerAgent":
        """A handle to one business's MCP tools."""
        return BowyerAgent(self, slug)


class BowyerAgent:
    """MCP tool access for a single business."""

    def __init__(self, client: BowyerClient, slug: str):
        self.client = client
        self.slug = slug

    def _rpc(self, method: str, params: Optional[dict] = None) -> Any:
        headers = {}
        if self.client.wallet:
            headers["x-bowyer-wallet"] = self.client.wallet
        response = self.client._request(
            f"/api/mcp/{self.slug}",
            method="POST",
            body={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            headers=headers,
        )
        if "error" in response and response["error"]:
            raise BowyerError(response["error"].get("message", "Tool call failed"))
        result = response.get("result", {})
        content = result.get("content")
        if content:
            text = content[0].get("text", "")
            try:
                return json.loads(text)
            except (ValueError, TypeError):
                return text
        return result

    def list_tools(self) -> list[dict]:
        """List the tools this business exposes."""
        result = self.client._request(
            f"/api/mcp/{self.slug}",
            method="POST",
            body={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )
        return result.get("result", {}).get("tools", [])

    def call_tool(self, name: str, arguments: Optional[dict] = None) -> Any:
        """Call any tool by name."""
        return self._rpc("tools/call", {"name": name, "arguments": arguments or {}})

    def generate_report(self, topic: Optional[str] = None) -> dict:
        """Ask the business to research and publish a new report right now."""
        args = {"topic": topic} if topic else {}
        return self.call_tool("generate_report", args)

    def latest_reports(self, limit: int = 5) -> list[dict]:
        """The business's most recent published reports."""
        return self.call_tool("get_latest_reports", {"limit": limit}).get("reports", [])

    def ask(self, question: str) -> str:
        """Ask a free-form question in the business's domain."""
        return self.call_tool("ask", {"question": question}).get("answer", "")

    def status(self) -> dict:
        """Operational status, including live GitHub stats for OSS businesses."""
        return self.call_tool("get_status")
