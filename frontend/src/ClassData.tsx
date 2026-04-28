import {useCallback, useEffect, useMemo, useState} from "react";
import {Alert, Button, Card, Empty, Input, Pagination, Select, Space, Tag, Typography} from "antd";
import ReactJson from "react-json-view";
import {getClassWithFilter, WhereFilter} from "./api.ts";

type PropertyMeta = {
    name: string;
    dataType?: string[];
    nestedProperties?: PropertyMeta[];
};

type ClassDataProps = {
    pathname: string;
    propties?: PropertyMeta[];
};

type DocumentRow = {
    id: string;
    raw: Record<string, any>;
};

const safeStringify = (value: any) : string => {
    const visited = new WeakSet<object>();
    try {
        return JSON.stringify(value, (_key, currentValue) => {
            if (currentValue && typeof currentValue === "object") {
                if (visited.has(currentValue)) {
                    return "[Circular]";
                }
                visited.add(currentValue);
            }
            return currentValue;
        });
    } catch (_error) {
        return String(value);
    }
};

const normalizeType = (property?: PropertyMeta) : string => {
    const rawType = property?.dataType?.[0] || "text";
    return rawType.toLowerCase();
};

const isNumberType = (valueType: string) : boolean => {
    return ["number", "int", "integer"].includes(valueType);
};

const isBooleanType = (valueType: string) : boolean => {
    return valueType === "boolean" || valueType === "bool";
};

const isDateType = (valueType: string) : boolean => {
    return valueType === "date";
};

const isObjectLikeType = (valueType: string) : boolean => {
    if (!valueType) {
        return false;
    }
    if (valueType === "object" || valueType === "object[]") {
        return true;
    }
    return valueType.endsWith("_object") || valueType.endsWith("_object[]") || valueType.includes("object");
};

const buildPropertySelection = (property: PropertyMeta) : string | null => {
    const valueType = normalizeType(property);
    if (isObjectLikeType(valueType)) {
        const nested = (property.nestedProperties || [])
            .map((item) => buildPropertySelection(item))
            .filter((item): item is string => Boolean(item));
        if (!nested.length) {
            return null;
        }
        return `${property.name} { ${nested.join(" ")} }`;
    }
    if (valueType === "geocoordinates") {
        return `${property.name} { latitude longitude }`;
    }
    return property.name;
};

const buildWhereFilter = (
    field: string,
    operator: string,
    value: string,
    properties: PropertyMeta[]
) : WhereFilter | null => {
    if (!field || !value.trim()) {
        return null;
    }

    const targetProperty = properties.find((item) => item.name === field);
    const valueType = normalizeType(targetProperty);
    const trimmedValue = value.trim();
    const whereBase = {
        path: [field],
        operator,
    };

    if (operator === "Like") {
        return {
            ...whereBase,
            valueText: `*${trimmedValue}*`,
        };
    }

    if (isNumberType(valueType)) {
        const parsed = Number(trimmedValue);
        if (Number.isNaN(parsed)) {
            return null;
        }
        return {
            ...whereBase,
            valueNumber: parsed,
        };
    }

    if (isBooleanType(valueType)) {
        const normalized = trimmedValue.toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
            return null;
        }
        return {
            ...whereBase,
            valueBoolean: normalized === "true",
        };
    }

    if (isDateType(valueType)) {
        return {
            ...whereBase,
            valueDate: trimmedValue,
        };
    }

    return {
        ...whereBase,
        valueText: trimmedValue,
    };
};

const toPreviewText = (value: any) : string => {
    if (value === null || value === undefined) {
        return "-";
    }
    if (typeof value === "object") {
        return safeStringify(value);
    }
    return String(value);
};

export default function ({pathname, propties = []}: ClassDataProps) {
    const className = pathname.replace("/class/", "");
    const propertyNames = useMemo(() => propties.map((item) => item.name), [propties]);
    const queryProperties = useMemo(
        () => propties
            .map((item) => buildPropertySelection(item))
            .filter((item): item is string => Boolean(item)),
        [propties]
    );

    const [searchDraft, setSearchDraft] = useState("");
    const [filterField, setFilterField] = useState<string>();
    const [filterOperator, setFilterOperator] = useState("Like");
    const [filterValue, setFilterValue] = useState("");

    const [appliedSearch, setAppliedSearch] = useState("none");
    const [appliedFilterField, setAppliedFilterField] = useState<string>();
    const [appliedFilterOperator, setAppliedFilterOperator] = useState("Like");
    const [appliedFilterValue, setAppliedFilterValue] = useState("");

    const [visibleFields, setVisibleFields] = useState<string[]>(propertyNames);
    const [documents, setDocuments] = useState<DocumentRow[]>([]);
    const [selectedDocument, setSelectedDocument] = useState<DocumentRow>();
    const [expandedFieldKeys, setExpandedFieldKeys] = useState<Set<string>>(new Set());
    const [showDetails, setShowDetails] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        setVisibleFields(propertyNames);
    }, [propertyNames]);

    useEffect(() => {
        setPage(1);
        setPageSize(20);
        setSearchDraft("");
        setFilterField(undefined);
        setFilterOperator("Like");
        setFilterValue("");
        setAppliedSearch("none");
        setAppliedFilterField(undefined);
        setAppliedFilterOperator("Like");
        setAppliedFilterValue("");
        setSelectedDocument(undefined);
        setExpandedFieldKeys(new Set());
        setShowDetails(false);
        setErrorMessage("");
    }, [pathname]);

    const loadDocuments = useCallback(async () => {
        const whereFilter = buildWhereFilter(
            appliedFilterField || "",
            appliedFilterOperator,
            appliedFilterValue,
            propties
        );
        if (appliedFilterField && appliedFilterValue && !whereFilter) {
            setErrorMessage("Filter value does not match the selected field type.");
            setDocuments([]);
            setTotal(0);
            return;
        }

        setLoading(true);
        try {
            const response = await getClassWithFilter(
                pathname,
                (page - 1) * pageSize,
                pageSize,
                appliedSearch || "none",
                queryProperties,
                whereFilter
            );

            const normalized = (response?.data || []).map((row: any, index: number) => ({
                id: row?._additional?.id || `${page}-${index}`,
                raw: row || {},
            }));

            setDocuments(normalized);
            setTotal(response?.count || 0);
            setErrorMessage(response?.errors?.[0]?.message || "");

            if (selectedDocument) {
                const selectedStillExists = normalized.find((item) => item.id === selectedDocument.id);
                if (!selectedStillExists) {
                    setSelectedDocument(undefined);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [
        appliedFilterField,
        appliedFilterOperator,
        appliedFilterValue,
        appliedSearch,
        page,
        pageSize,
        pathname,
        propties,
        queryProperties,
        selectedDocument,
    ]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    const hiddenFieldCount = Math.max(propertyNames.length - visibleFields.length, 0);

    return (
        <div className="class-data-layout">
            <Card className="filter-card" size="small">
                <Space wrap size={12} className="filter-toolbar">
                    <Input.Search
                        value={searchDraft}
                        placeholder="Semantic search"
                        allowClear
                        style={{width: 240}}
                        onChange={(event) => setSearchDraft(event.target.value)}
                        onSearch={() => {
                            setAppliedSearch(searchDraft.trim() || "none");
                            setPage(1);
                        }}
                    />
                    <Select
                        value={filterField}
                        placeholder="Field"
                        allowClear
                        style={{width: 170}}
                        options={propties.map((property) => ({label: property.name, value: property.name}))}
                        onChange={(value) => setFilterField(value)}
                    />
                    <Select
                        value={filterOperator}
                        style={{width: 140}}
                        options={[
                            {label: "Contains", value: "Like"},
                            {label: "Equals", value: "Equal"},
                            {label: ">", value: "GreaterThan"},
                            {label: "<", value: "LessThan"},
                        ]}
                        onChange={(value) => setFilterOperator(value)}
                    />
                    <Input
                        value={filterValue}
                        placeholder="Filter value"
                        style={{width: 190}}
                        onChange={(event) => setFilterValue(event.target.value)}
                    />
                    <Button
                        type="primary"
                        onClick={() => {
                            setAppliedSearch(searchDraft.trim() || "none");
                            setAppliedFilterField(filterField);
                            setAppliedFilterOperator(filterOperator);
                            setAppliedFilterValue(filterValue);
                            setPage(1);
                        }}
                    >
                        Apply
                    </Button>
                    <Button
                        onClick={() => {
                            setSearchDraft("");
                            setFilterField(undefined);
                            setFilterOperator("Like");
                            setFilterValue("");
                            setAppliedSearch("none");
                            setAppliedFilterField(undefined);
                            setAppliedFilterOperator("Like");
                            setAppliedFilterValue("");
                            setPage(1);
                            setErrorMessage("");
                        }}
                    >
                        Reset
                    </Button>
                    <Select
                        mode="multiple"
                        value={visibleFields}
                        style={{minWidth: 260, maxWidth: 420}}
                        placeholder="Visible fields"
                        maxTagCount="responsive"
                        options={propertyNames.map((name) => ({label: name, value: name}))}
                        onChange={(value) => setVisibleFields(value)}
                    />
                    <Button onClick={() => setShowDetails((current) => !current)}>
                        {showDetails ? "Hide Detail Panel" : "Show Detail Panel"}
                    </Button>
                    <Tag color="blue">Class: {className}</Tag>
                    {hiddenFieldCount > 0 ? <Tag color="orange">Hidden fields: {hiddenFieldCount}</Tag> : null}
                </Space>
                {errorMessage ? <Alert type="warning" showIcon message={errorMessage} style={{marginTop: 12}}/> : null}
            </Card>

            <div className={showDetails ? "class-content-grid" : "class-content-grid class-content-grid-closed"}>
                <Card className="table-card mongo-card" size="small" title="Documents">
                    {documents.length === 0 && !loading ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents"/>
                    ) : (
                        <div className="document-list">
                            {documents.map((document) => {
                                const isSelected = selectedDocument?.id === document.id;
                                return (
                                    <Card
                                        key={document.id}
                                        size="small"
                                        className={`document-card ${isSelected ? "document-card-selected" : ""}`}
                                        onClick={() => setSelectedDocument(document)}
                                    >
                                        <div className="document-id-row">
                                            <Typography.Text strong>ID</Typography.Text>
                                            <Typography.Text className="document-id-value">{document.id}</Typography.Text>
                                        </div>
                                        {visibleFields.length === 0 ? (
                                            <Typography.Text type="secondary">No visible fields selected.</Typography.Text>
                                        ) : (
                                            visibleFields.map((fieldName) => (
                                                <div key={`${document.id}-${fieldName}`} className="doc-field-row">
                                                    <Typography.Text className="doc-field-name">{fieldName}</Typography.Text>
                                                    <div>
                                                        {(() => {
                                                            const fieldKey = `${document.id}-${fieldName}`;
                                                            const textValue = toPreviewText(document.raw?.[fieldName]);
                                                            const isLongText = textValue.length > 180;
                                                            const isExpanded = expandedFieldKeys.has(fieldKey);
                                                            return (
                                                                <>
                                                                    <Typography.Text className={`doc-field-value ${isExpanded ? "doc-field-value-expanded" : ""}`}>
                                                                        {textValue}
                                                                    </Typography.Text>
                                                                    {isLongText ? (
                                                                        <Button
                                                                            type="link"
                                                                            size="small"
                                                                            className="field-toggle-btn"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                setExpandedFieldKeys((prev) => {
                                                                                    const next = new Set(prev);
                                                                                    if (next.has(fieldKey)) {
                                                                                        next.delete(fieldKey);
                                                                                    } else {
                                                                                        next.add(fieldKey);
                                                                                    }
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                        >
                                                                            {isExpanded ? "Hide" : "Expand"}
                                                                        </Button>
                                                                    ) : null}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                    <div className="documents-pagination">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            showSizeChanger
                            pageSizeOptions={[10, 20, 50, 100]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    </div>
                </Card>

                {showDetails ? (
                    <Card
                        className="structure-card"
                        size="small"
                        title="Document Detail"
                        extra={<Button size="small" onClick={() => setShowDetails(false)}>Close</Button>}
                    >
                        <ReactJson
                            src={selectedDocument?.raw || {hint: "Select a document to inspect full JSON."}}
                            collapsed={1}
                            enableClipboard={false}
                            displayDataTypes={false}
                            style={{fontSize: "12px"}}
                        />
                    </Card>
                ) : null}
            </div>
        </div>
    );
}
