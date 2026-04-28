export type NormalizedProperty = {
    name: string;
    dataType: string[];
    nestedProperties?: NormalizedProperty[];
    raw?: any;
};

export type NormalizedCollection = {
    name: string;
    description?: string;
    vectorizer?: string;
    vectorIndexType?: string;
    properties: NormalizedProperty[];
    raw: any;
};

type RawCollectionCandidate = {
    key?: string;
    value: any;
};

const toStringArray = (value: any) : string[] => {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item : String(item ?? "")))
            .filter((item) => Boolean(item));
    }
    if (value === null || value === undefined) {
        return [];
    }
    return [typeof value === "string" ? value : String(value)];
};

const normalizeProperty = (rawProperty: any) : NormalizedProperty | null => {
    const name = rawProperty?.name || rawProperty?.property || rawProperty?.field;
    if (!name) {
        return null;
    }

    const nestedRaw = rawProperty?.nestedProperties || rawProperty?.nested_properties || [];
    const nestedProperties = Array.isArray(nestedRaw)
        ? nestedRaw
            .map((item) => normalizeProperty(item))
            .filter((item): item is NormalizedProperty => Boolean(item))
        : [];

    return {
        name: String(name),
        dataType: toStringArray(rawProperty?.dataType ?? rawProperty?.data_type ?? rawProperty?.type),
        nestedProperties: nestedProperties.length ? nestedProperties : undefined,
        raw: rawProperty,
    };
};

const toCandidates = (container: any) : RawCollectionCandidate[] => {
    if (Array.isArray(container)) {
        return container.map((value) => ({value}));
    }
    if (container && typeof container === "object") {
        return Object.entries(container).map(([key, value]) => ({key, value}));
    }
    return [];
};

const extractRawCollections = (schemaResponse: any) : RawCollectionCandidate[] => {
    const candidatesByKnownPath =
        toCandidates(schemaResponse?.classes)
            .concat(toCandidates(schemaResponse?.collections))
            .concat(toCandidates(schemaResponse?.data?.classes))
            .concat(toCandidates(schemaResponse?.data?.collections));
    if (candidatesByKnownPath.length) {
        return candidatesByKnownPath;
    }
    return toCandidates(schemaResponse);
};

export const normalizeSchema = (schemaResponse: any) : NormalizedCollection[] => {
    return extractRawCollections(schemaResponse)
        .map(({key, value: rawCollection}) => {
            const name = rawCollection?.class || rawCollection?.name || rawCollection?.collection || key;
            if (!name) {
                return null;
            }

            const propertiesRaw = rawCollection?.properties || rawCollection?.config?.properties || [];
            const properties = Array.isArray(propertiesRaw)
                ? propertiesRaw
                    .map((item) => normalizeProperty(item))
                    .filter((item): item is NormalizedProperty => Boolean(item))
                : [];

            return {
                name: String(name),
                description: rawCollection?.description || rawCollection?.config?.description,
                vectorizer: rawCollection?.vectorizer || rawCollection?.vectorizer_config?.name,
                vectorIndexType: rawCollection?.vectorIndexType || rawCollection?.vector_index_type,
                properties,
                raw: rawCollection,
            } as NormalizedCollection;
        })
        .filter((item): item is NormalizedCollection => Boolean(item));
};
