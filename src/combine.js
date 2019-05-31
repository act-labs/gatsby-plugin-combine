const path = require('path');


const fs = require('fs');
const slash = require('slash');

function hasKey(obj, key) {
  return Object.keys(obj).indexOf(key) !== -1;
}

function extract(dst, src, id) {
  if (typeof id == "string") {
    id = id.split('.');
  }

  const key = id[id.length - 1];
  const val = id.reduce((o, k) => o && hasKey(o, k) ? o[k] : null, src);
  dst[key] = val;
}

function getSlug(node){
    const slug = node.fields.slug;
    if (!slug.startsWith("/pages/")){
        return slug;
    }

    if (slug === "/pages/"){
        return "/index/"
    }

    return slug.substring(6);
}

function extractNodeContext({node, options, api}) {
    const slug = api.getSlug(node);
    let parent = path.dirname(slug);

    if (parent.substr(-1) != "/") {
        parent += "/";
    }

    const parent_re = `/^${parent}/`;
    let context = {
        id: node.id,
        fileAbsolutePath: node.fileAbsolutePath,
        slug,
        parent,
        parent_re
    };

    if (options.additional_context) {
        context = Object.assign({}, context, options.additional_context);
    }

    if (options.attributes) {
        for (const name of options.attributes) {
            extract(context, node, name);
        }
    }

    return context;
}

function queryFactory({
  rootQuery,
  nodeSubquery
}) {
  const filePath =  (rootQuery === "allMdx") ? "fileAbsolutePath": "";
  return `
    query SelectNodesQuery ($path: String) {
        nodes: ${rootQuery} (filter:{
            fields:{slug: {regex: $path} }
        })        
        {
            edges {
                node {
                    id
                    ${filePath}
                    fields {
                        slug
                    }
                    ${nodeSubquery}
                }
            }
        }
    }
    `;
}

async function selectNodes({gatsby, options, api}) {
    const {queryFactory} = api;
    const query = queryFactory(options);

    const result = await gatsby.graphql(query, {
        path: `/^${options.path}/`
    });

    if (result.errors) {
        console.error(result.errors);
        throw result.errors;
    }

    if (!result.data.nodes) {
        return [];
    }

    return result.data.nodes.edges.map(v => v.node);
}

function loadModule(options){
    if (!options.helper){
        return defaultHelper;
    }
    const helper = Object.assign({}, defaultHelper, require(path.resolve(options.helper)));
    for (const name of Object.keys(helper.entities)){
        helper.entities[name] = Object.assign({}, defaultPart, helper.entities[name]);
    }

    return helper;  
}


function getScope({part, nodeContext}){
    const scope = part.scope;
    switch (scope){
        case "parent":
            return nodeContext.parent;
    }
    return undefined    
}

async function scopedQuery({name, part, globalContext, nodeContext, gatsby, userApi}){
    if (!globalContext[name]){
        globalContext[name] = {}
    }
    const scope = getScope({part, nodeContext});
    if (scope && globalContext[name][scope]){
        return {cached:globalContext[name][scope]};
    }

    const query = part.query(userApi);
    if (!query){
        return {data: null, scope}
    }
    const {
        data
    } = await gatsby.graphql(query, nodeContext);
    return {data, scope}
}

function generatePage({slug, template, templateContext}){
    const dir = path.join(process.cwd(), "./src/generated", path.dirname(slug));

    const fileName = path.join(dir, path.basename(slug) + ".js");
    const fileContent = template(templateContext);
    writeFile(fileName, fileContent);

    return slash(fileName);
}

const defaultPart = {
    query: ()=> null,            
    data: (_, {nodeContext})=> {
        return nodeContext
    }              
}

const defaultHelper = {
    combine(context, {generatePage, createPage, options}){
        if (options.template){
            generatePage();
        }

        createPage(context);
    },    
    entities:{
        main:defaultPart
    }
}


function writeFile(file, content){
    const dir = path.dirname(file);
    fs.mkdirSync(dir, {
        recursive: true
    });    
    fs.writeFileSync(file, content);
}

function writeSlug(dir, slug, name, content){
    const fileName = path.join(process.cwd(), dir, slug, name);
    writeFile(fileName, typeof content === "string" ? content:JSON.stringify(content));

    return slash(fileName);    
}

function pagePath({slug, id, options}){
    if (slug === "/index/" && !id){   
        return "/"
    }
    const prefixed = options.prefix ? path.posix.join(options.prefix, slug): slug;
    const paged = id !== 0 ? path.posix.join(prefixed, String(id), "/") : prefixed;
    return paged;
}

function createPage({context, gatsby, component, slug, options, id, api}){
    const {pagePath} = api;

    const path = pagePath({slug, id, options});
    gatsby.actions.createPage({
        path,
        component,
        context
    });

}

function createUserApi({node, template, nodeContext, gatsby, options, api}){
    const {createPage, generatePage, writeSlug} = api;
    const slug = nodeContext.slug
    const userApi = {component: options.component? path.resolve(options.component) : node.fileAbsolutePath, nodeContext, options, gatsby}
    userApi.generatePage = (context)=>{
        const templateContext = Object.assign({}, nodeContext, context);
        const args = Object.assign({}, {templateContext}, {slug, template});
        const component = generatePage(args);
        userApi.component = component;
    };

    userApi.createPage = (context, additional)=>{
        additional = Object.assign({id:0}, additional)
        const pageContext = context ? context : nodeContext;
        createPage({context: pageContext, gatsby, component:userApi.component, slug, options, id:additional.id, api});
    };    

    userApi.writeData = (name, content) => writeSlug("./data", slug, name, content)

    return userApi;
}

async function processNode({globalContext, node, nodeContext, helper, template, gatsby, options, api}){
    const {createUserApi, scopedQuery } = api;
    const userApi = createUserApi({node, template, nodeContext, gatsby, options, api});
    const context = {};
    for (const [name, part] of Object.entries(helper.entities)){
        const {cached, data, scope} = await scopedQuery({name, part, globalContext, nodeContext, gatsby, userApi})
        if (cached){
            Object.assign(context, cached);
            continue
        }
        const value = await Promise.resolve(part.data(data, userApi));
        if (scope){
            globalContext[name][scope] = value;
        }
        Object.assign(context, value);
    }
    await helper.combine(context, userApi);
}

async function processNodes({nodes, helper, template, gatsby, options, api}){
    const globalContext = {};
    for (const node of nodes) {
        const nodeContext = extractNodeContext({node, options, api});
        await processNode({globalContext, node, nodeContext, helper, template, gatsby, options, api})
    }
}

async function getTemplate(options){
    if (options.template) {
        const compiler = require('lodash.template');
        return compiler(fs.readFileSync(path.resolve(options.template)));
    }
    return undefined 
}

async function createCompoundPages({gatsby, options, api}) {
    if (!api) api = module.exports;

    const {loadModule, selectNodes, processNodes, getTemplate, defaultOptions} = api;
    options = Object.assign({}, defaultOptions, options);

    const helper = loadModule(options) || {};
    const nodes = await selectNodes({gatsby, options, api});
    const template = await getTemplate(options);

    await processNodes({nodes, template, gatsby, options, api, helper});
}

const defaultOptions = {
    component: null,
    template: null,
    prefix: null,
    path: "/posts/",
    rootQuery: "allMdx",
    nodeSubquery: ``,
    additional_context: null,
    attributes: null
};

module.exports = {
    pagePath,
    extract,
    queryFactory,
    selectNodes,
    createCompoundPages,
    loadModule,
    processNodes,
    processNode,
    getTemplate,
    extractNodeContext,
    defaultOptions,
    createUserApi,
    scopedQuery,
    createPage,
    generatePage,
    defaultHelper,
    writeSlug,
    getSlug
};