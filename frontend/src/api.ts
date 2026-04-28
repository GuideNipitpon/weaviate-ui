const host = (import.meta.env.VITE_API_BASE_URL as string | undefined)
    || (import.meta.env.DEV ? "http://localhost:8000" : "");

export type WhereFilter = {
    path: string[];
    operator: string;
    valueText?: string;
    valueNumber?: number;
    valueBoolean?: boolean;
    valueDate?: string;
}

export const getSchema = async () => {
    try {
        const res = await fetch(host + "/schema");
        return await res.json();
    } catch (error) {
        console.error("getSchema error:", error);
        return { data: [], count: 0, errors: [{ message: String(error) }] };
    }
}

export const getClass = async (className: string, offset: number, limit: number,keyword:string, properties: string[]) => {
    try {
        const res = await fetch(`${host + className}/${offset}/${limit}/${encodeURIComponent(keyword || "none")}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    properties,
                }),
            }
        );
        return await res.json();
    } catch (error) {
        console.error("getClass error:", error);
        return { data: [], count: 0, errors: [{ message: String(error) }] };
    }

}

export const getClassWithFilter = async (
    className: string,
    offset: number,
    limit: number,
    keyword: string,
    properties: string[],
    where?: WhereFilter | null
) => {
    try {
        const res = await fetch(`${host + className}/${offset}/${limit}/${encodeURIComponent(keyword || "none")}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    properties,
                    where,
                }),
            }
        );
        return await res.json();
    } catch (error) {
        console.error("getClassWithFilter error:", error);
        return { data: [], count: 0, errors: [{ message: String(error) }] };
    }
}
