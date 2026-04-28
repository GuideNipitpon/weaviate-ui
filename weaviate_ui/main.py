
from dotenv import load_dotenv
from fastapi import FastAPI, Body
from typing import Any, List, Optional
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
import os

import weaviate
from weaviate.connect import ConnectionParams
from weaviate.classes.query import Filter
from weaviate.connect import ConnectionParams

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to your self-hosted Weaviate
client = weaviate.WeaviateClient(
    connection_params=ConnectionParams.from_params(
        http_host=os.getenv("WEAVIATE_HOST"),   
        http_port=int(os.getenv("WEAVIATE_PORT", 8080)),
        http_secure=False,                       
        grpc_host=os.getenv("WEAVIATE_HOST"),
        grpc_port=50051,
        grpc_secure=False,   
    )
)

client.connect()


def _normalize_requested_properties(properties: Any) -> Optional[List[str]]:
    if not isinstance(properties, list):
        return properties

    normalized: List[str] = []
    seen = set()
    for item in properties:
        if not isinstance(item, str):
            continue

        field_name = item.split("{", 1)[0].strip()
        if not field_name or field_name in seen:
            continue
        seen.add(field_name)
        normalized.append(field_name)

    return normalized or None


def _schema_property_type(property_schema: Any) -> str:
    if isinstance(property_schema, dict):
        data_type = property_schema.get("data_type") or property_schema.get("dataType") or property_schema.get("type")
    else:
        data_type = getattr(property_schema, "data_type", None) or getattr(property_schema, "dataType", None) or getattr(property_schema, "type", None)

    if isinstance(data_type, list) and data_type:
        data_type = data_type[0]

    if data_type is None:
        return ""
    return str(data_type).lower()


def _collection_property_map(collection: Any) -> dict[str, Any]:
    config = None
    if hasattr(collection, "config") and callable(getattr(collection.config, "get", None)):
        config = collection.config.get()
    elif hasattr(collection, "config"):
        config = collection.config

    properties = None
    if isinstance(config, dict):
        properties = config.get("properties")
    else:
        properties = getattr(config, "properties", None)

    if not isinstance(properties, list):
        return {}

    result: dict[str, Any] = {}
    for item in properties:
        name = None
        if isinstance(item, dict):
            name = item.get("name")
        else:
            name = getattr(item, "name", None)
        if name:
            result[str(name)] = item
    return result


def _is_returnable_property(property_schema: Any) -> bool:
    property_type = _schema_property_type(property_schema)
    if not property_type:
        return True
    if "object" in property_type:
        return False
    if "blob" in property_type:
        return False
    if "reference" in property_type:
        return False
    return True


def _filter_return_properties(collection: Any, requested_properties: Optional[List[str]]) -> Optional[List[str]]:
    if not isinstance(requested_properties, list):
        return requested_properties

    property_map = _collection_property_map(collection)
    if not property_map:
        return requested_properties

    filtered: List[str] = []
    seen = set()
    for property_name in requested_properties:
        if property_name in seen:
            continue
        seen.add(property_name)

        property_schema = property_map.get(property_name)
        if property_schema is not None and not _is_returnable_property(property_schema):
            continue
        filtered.append(property_name)
    return filtered or None


def _extract_filter_value(where_filter: dict) -> Any:
    for key in ("valueText", "valueString", "valueNumber", "valueBoolean", "valueDate"):
        if key in where_filter and where_filter[key] is not None:
            return where_filter[key]
    return None


def _build_weaviate_filter(where_filter: Any):
    if not isinstance(where_filter, dict):
        return None

    path = where_filter.get("path")
    if not isinstance(path, list) or not path:
        return None

    property_name = path[0]
    operator = where_filter.get("operator")
    value = _extract_filter_value(where_filter)
    if value is None:
        return None

    base_filter = Filter.by_property(property_name)
    if operator == "Like":
        return base_filter.like(value)
    if operator == "GreaterThan":
        return base_filter.greater_than(value)
    if operator == "LessThan":
        return base_filter.less_than(value)
    # Default to equality for "Equal" and unknown operators
    return base_filter.equal(value)


@app.get("/schema")
def schema():
    collections = client.collections.list_all()
    return collections


@app.post("/class/{class_name}/{offset}/{limit}/{keyword}")
def class0(
    class_name: str,
    offset: int,
    limit: int,
    keyword: str = '',
    payload: Any = Body(default=None)
):
    properties: Optional[List[str]] = None
    where_filter = None

    if isinstance(payload, list):
        properties = payload
    elif isinstance(payload, dict):
        properties = payload.get("properties")
        where_filter = payload.get("where")
    collection = client.collections.get(class_name)

    query_kwargs = {
        "limit": limit,
        "offset": offset,
    }

    # keyword search (nearText replacement)
    if keyword and keyword != "none":
        query_kwargs["near_text"] = {"concepts": [keyword]}

    # where filter (convert dict → Filter if needed)
    built_filter = _build_weaviate_filter(where_filter)
    if built_filter is not None:
        query_kwargs["filters"] = built_filter

    response = collection.query.fetch_objects(**query_kwargs)
    
    # count (aggregation)
    agg = collection.aggregate.over_all(total_count=True)

    return {
        "data": [
            {
                **(obj.properties or {}),
                "_additional": {"id": str(obj.uuid)},
            }
            for obj in response.objects
        ],
        "count": agg.total_count,
        "errors": None
    }


if os.path.isdir("static") :
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
