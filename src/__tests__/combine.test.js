const api = require("../combine");
const fs = require("fs");
const path = require("path")

jest.mock("fs");

describe("gatsby-plugin-combine", ()=>{
    it("template compiled", async ()=>{
        fs.readFileSync = jest.fn(()=>"<%= value %>");
        const template = await api.getTemplate({template:"./template-file.js"});
        expect(template({value: 1})).toBe("1");
        expect(fs.readFileSync.mock.calls[0][0]).toBe(path.resolve("./template-file.js"));
        fs.readFileSync.mockReset()
    })

    it("nodes selected based on slug and file type", async ()=>{
        const node = {val:2}
        const gatsby = {
            graphql: jest.fn(()=>{
                return {
                    data:{
                        nodes:{
                            edges:[{node}]
                        }
                    }
                }
            })
        }
 
        const options = {...api.defaultOptions, ...{path:"/posts/"} };
        const nodes = await api.selectNodes({gatsby, api, options});
        expect(nodes).toEqual([node]);
        expect(gatsby.graphql.mock.calls[0][1]).toEqual({path:"/^/posts//"});
        expect(gatsby.graphql.mock.calls[0][0]).toEqual(expect.stringContaining("allMdx"));
        expect(gatsby.graphql.mock.calls[0][0]).toEqual(expect.stringContaining("slug"));
        expect(gatsby.graphql.mock.calls[0][0]).toMatchSnapshot();                 
    })    

    it("node context is extracted", async ()=>{
        const node = {
            id: "id1",
            fileAbsolutePath: "/absolute/path/to/file",
            fields: {
                slug: "/to/file/" 
            },
            frontmatter :{
                code: "code1"
            }
        };

        const options = {
            additional_context: {
                compound: true
            },
            attributes: ["frontmatter.code"]            
        };

        const context = await api.extractNodeContext({node, options, api});
        expect(context).toEqual({
            id: "id1",
            fileAbsolutePath: "/absolute/path/to/file",
            slug: "/to/file/",
            parent: "/to/",
            parent_re: "/^/to//",
            code: "code1",
            compound: true            
        });            
    })

    it("getPath should return the page path", ()=>{
        expect( api.pagePath({slug:"/slug/", id:1, options:{}, helper:{}}) ).toBe("/slug/1/");
        expect( api.pagePath({slug:"/slug", id:1, options:{}, helper:{}}) ).toBe("/slug/1/");
        expect( api.pagePath({slug:"/slug/", id:0, options:{}, helper:{}}) ).toBe("/slug/");            
    });    

    
    describe("user api", ()=>{
        it("userApi", async ()=>{
            const node = {fileAbsolutePath:"/absolute/path/to/file"}
            const nodeContext = {slug:"/to/file/"}
            const options = {}, gatsby = {}, template = jest.fn(), apiMock = {};            
            const user = api.createUserApi({node, template, nodeContext, gatsby, options, api:apiMock})

            expect(user).toMatchObject({component:"/absolute/path/to/file", nodeContext, options});            
        });       
    });

})

