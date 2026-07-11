"""BOWYER SDK - Python client for the BOWYER platform.

The App Store for Autonomous Businesses on Robinhood Chain.

    from bowyer_sdk import BowyerClient

    bowyer = BowyerClient(wallet="0xYourWallet")
    businesses = bowyer.list_businesses()

    agent = bowyer.agent("gpt-researcher")
    report = agent.generate_report("EU rate outlook")
    answer = agent.ask("What changed in the market today?")

Uses only the Python standard library - no dependencies.
"""

from .client import BowyerAgent, BowyerClient, BowyerError

__all__ = ["BowyerClient", "BowyerAgent", "BowyerError"]
__version__ = "0.1.0"
