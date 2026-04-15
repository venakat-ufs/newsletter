from abc import ABC, abstractmethod
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
import inspect
from typing import Any


@dataclass
class SourceResult:
    source: str
    collected_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    data: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    success: bool = True

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "collected_at": self.collected_at,
            "data": self.data,
            "errors": self.errors,
            "success": self.success,
        }


class BaseSource(ABC):
    name: str = "base"

    @abstractmethod
    def collect(self) -> SourceResult:
        """Collect data from this source. Must not raise — return errors in SourceResult."""
        pass

    async def safe_collect_async(self) -> SourceResult:
        """Async-safe collect wrapper so both sync and async collectors are supported."""
        try:
            result = self.collect()
            if inspect.isawaitable(result):
                result = await result
            if isinstance(result, SourceResult):
                return result
            raise TypeError(
                f"{self.__class__.__name__}.collect() returned {type(result)!r}, "
                "expected SourceResult"
            )
        except Exception as e:
            return SourceResult(
                source=self.name,
                data=[],
                errors=[f"Unhandled error: {str(e)}"],
                success=False,
            )

    def safe_collect(self) -> SourceResult:
        """Sync wrapper for legacy pipelines."""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self.safe_collect_async())

        raise RuntimeError(
            "safe_collect() was called inside a running event loop. "
            "Use await safe_collect_async() instead."
        )
