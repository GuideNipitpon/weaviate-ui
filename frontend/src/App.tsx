import {BorderlessTableOutlined, DatabaseOutlined, TableOutlined} from "@ant-design/icons";
import {PageContainer, ProLayout} from "@ant-design/pro-components";
import {useEffect, useMemo, useState} from "react";
import {getSchema} from "./api.ts";
import ClassData from "./ClassData.tsx";
import {NormalizedProperty, normalizeSchema} from "./schemaAdapter.ts";
import Welcome from "./Welcome.tsx";
import "./App.css";

type RouteConfig = {
    path: string;
    name: string;
    icon?: JSX.Element;
    routes?: RouteConfig[];
};

export default function App() {
    const [pathname, setPathname] = useState("/");
    const [class2props, setClass2props] = useState<Record<string, NormalizedProperty[]>>({});
    const [classRoutes, setClassRoutes] = useState<RouteConfig[]>([]);

    useEffect(() => {
        getSchema().then((schemaResponse) => {
            const classes = normalizeSchema(schemaResponse);
            setClassRoutes(
                classes.map((schema) => ({
                    path: `/class/${schema.name}`,
                    name: schema.name,
                    icon: <DatabaseOutlined/>,
                }))
            );

            const propertyMap: Record<string, NormalizedProperty[]> = {};
            classes.forEach((schema) => {
                propertyMap[`/class/${schema.name}`] = schema.properties || [];
            });
            setClass2props(propertyMap);
        });
    }, []);

    const routes = useMemo(() => ({
        route: {
            path: "/",
            routes: [
                {
                    path: "/schema",
                    name: "Schema",
                    icon: <BorderlessTableOutlined/>,
                },
                {
                    path: "/class",
                    name: "Class Data",
                    icon: <TableOutlined/>,
                    routes: classRoutes,
                },
            ],
        },
        location: {
            pathname,
        },
    }), [classRoutes, pathname]);

    return (
        <div className="app-root">
            <ProLayout
                {...routes}
                title="Weaviate UI"
                location={{pathname}}
                menu={{type: "group"}}
                siderWidth={236}
                menuItemRender={(item, dom) => (
                    <div onClick={() => setPathname(item.path || "/schema")}>
                        {dom}
                    </div>
                )}
            >
                <PageContainer className="page-container">
                    {pathname === "/" || pathname === "/schema" ? (
                        <Welcome/>
                    ) : (
                        <ClassData pathname={pathname} propties={class2props[pathname] || []}/>
                    )}
                </PageContainer>
            </ProLayout>
        </div>
    );
}
