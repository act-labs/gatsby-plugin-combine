# gatsby-plugin-combine

This is a Gatsby plugin to help build complex pages, when one normally had to resort directly to the Gatsby API. Instead, helper node.js modules could be used to define and later combine multiple page elements, to produce pages of practically any complexity. Each page element has its own GraphQL query and a data processing function. A simple API is provided to save/log data and generate pages using lodash templates. This plugin shields from the need to repetitively write the same code which hooks into Gatsby *createPages*, selects pages in subdirectories, queries sibling and child pages, saves data, generates pages, etc. The focus is also on a progressive and smooth page enhancements. Start really simple: only a few configuration options are needed to select GraphQL nodes, extract their information, and pass it to standard React page component. Later, when needed, one may advance to helper node.js modules, allowing multiple GraphQL queries, data logging, lodash templates and multiple pages per GraphQL node. Check [ACT blog starter](https://act-labs.github.io/posts/act-blog/) for more information/examples.

## The page construction process

Lets consider a common page construction process, for which *gatsby-plugin-combine* provides a tooling. A complex page typically consists of many distinct elements. Typically, pages are constructed from files. It is often convenient to organize relevant files hierarchically, in multiple subdirectories. Typically, a page is constructed from one root file (or technically from a corresponding GraphQL node), containing the main page content, and possibly from multiple additional files located in the same directory/subdirectories. 

This plugin assumes that all files are sourced to GraphQL nodes, and all nodes contain a *slug* (URI) field, used to query siblings and children nodes. A slug could be added, for example, using [gatsby-plugin-relative](https://github.com/act-labs/gatsby-plugin-relative)). For convenience, slugs from the */pages/* directory are mapped to root pages, i.e. a */pages/page1/* slug will be mapped to */page1/*.

At the first step, GraphQL nodes below some root *path* are selected and processed. Such nodes are called root nodes, typically they correspond to one page (but there could be multiple or none). By default, an *allMdx* GraphQL query is used. To conveniently query multiple files, a root file may contain some reference information, but in the simplest case no explicit information is needed.

In any case, for each root node, useful information is extracted into *nodeContext*. By default, it is an absolute file path, node id, slug, parent slug, and regular expression to select all sibling and child nodes. Using *nodeSubquery* and *attributes* plugin options, additional fields could be extracted (for example, *frontmatter* or some nested fields in the case of JSON files).

For pages of low to medium complexity, the ability to extract *nodeContext* should be enough to create pages using standard Gatsby tools (React page components and GraphQL queries). For more complex pages, or when someone strives for better code separation/testability, it is possible to use helper node.js modules and hook into page construction process. A helper module exports an *entities* object containing instructions how to query and process data for each distinct page element.

Finally, JS objects obtained for all entities are merged and the resulting JS object is used as a page context of the Gatsby *createPage* function. Or, alternatively, it could be further processed in a *combine* function. In the *combine* function an API to save data in files, generate pages using lodash templates, and create multiple pages is available.


## Install

`npm install --save gatsby-plugin-combine`

## Configuration options

```javascript
// In your gatsby-config.js
plugins: [
  {
    resolve: `gatsby-plugin-combine`,    
    options:  {
        template: './src/templates/snippets-layout.js', // a path of a lodash template used for page generation
        component: null, // mutually exclusive with the "template" option - a path of a page component (by default a root node file is used)
        helper: './src/helpers/posts-helper.js', // a helper module to orchestrate a page generation process
        path: "/snippets/", // (required) a root path used to select nodes below this path (based on a slug)
        prefix: null, // a prefix for the page URI, (e.g., "test" or "mobile" to get "/test/slug/" or "/mobile/slug/" instead of "/slug/")
        rootQuery: "allMdx", // a query to select root nodes (defaults to "allMdx" - markdown with JSX extensions)
        nodeSubquery: `
          frontmatter {
              title,
              keywords,
              menu
          }        
        `, // a subquery to select additional GraphQL node attributes
        additional_context: {snippet:true}, // an object merged into nodeContext
        attributes: ["frontmatter.title", ] // an array of attributes extracted from GraphQL nodes and added to nodeContext (make attributes available using nodeSubquery). To extract nested attributes, dot notation is supported, e.g., "frontmatter" adds to nodeContext the whole "frontmatter" object while "frontmatter.title" - just a single "title" attribute
    }    
  }   
]
```
## Node context

The plugin by default creates pages for every GraphQL node below the specified root path. Nodes are of an arbitrary configurable type (yaml, json, markdown) and may contain arbitrary information. For each node, selected useful information is extracted to a plain JS object - *nodeContext*. During page construction, *nodeContext* could be used in lodash templates, directly in React page components and helper module functions, but its main function is to serve as a parameter in later GraphQL queries. By default, *nodeContext* contains an absolute file path, node id, slug, parent path, and regular expression to select all siblings and child nodes. Using *nodeSubquery* and *attributes* options we can extract additional fields, for example, a frontmatter object or some nested fields from JSON files.

```javascript
// a pseudo-code definition of a default nodeContext object

const nodeContext = {
    id, // a page node id, could be used to query the node later
    fileAbsolutePath,  // an absolute path of the underlying file
    slug, // a slug (a page URI) - usually a relative file path
    parent, // a parent path (a convenience field, calculated from the slug)
    parent_re: `/^${parent}/` // a regular expression to select sibling and child nodes (a convenience field, calculated from the parent)
};
```
 

## A helper module API

A helper module orchestrates the page construction process, outlined above, facilitating additional data input and providing additional flexibility. It defines and returns entities - independent, self-sufficient units of data processing. Each entity can define a number of functions (*query*, *data*). A *combine* function could be also defined to process merged entity data. All these functions receive a JS object with useful information and an API. This object, later in code denoted by *api*, has the following fields:
1. *nodeContext* - information extracted from a root page GraphQL node.
2. *options* - plugin options from gatsby-config.js.
3. *gatsby* - a Gatsby API as received by the *createPages* function in gatsby-node.js.
Also the *api* object has a number of useful functions:
1. *writeData(name, content)* - writes *content* to the *data* directory (to a `path.join("./data", slug, name)` file). If the *content* parameter is a JS object, it is stringified using standard `JSON.stringify(content)`. The function returns an absolute path to the file written.
2. *generatePage(context)* - generates a page from a compiled lodash template. A plugin configuration contains a path to the template file (`options.template`). The *context* parameter is merged with *nodeContext* and passed to the template. The generated page is saved in the `./src/generated/` directory (a full file path is `path.join("./src/generated/", slug + ".js")`). The file generated is used later as a *component* parameter to the Gatsby *createPage* call. 
3. *createPage(context, {id})* - a simple wrapper around the Gatsby *createPage* API function. Under the hood, the Gatsby *createPage* function is called with a *component* parameter equal to the path of the generated page (or `options.component`, or the path of the root node file). The page context is the *context* parameter (if omitted, *nodeContext* is used instead). The page path is a prefix plus a slug (`path.join(options.prefix, slug)`). Multiple pages could be created using the optional *id* parameter, which, if not zero, is appended to the resulting page URI (`path.join(options.prefix, slug, id)`).


## Helper node.js module

```javascript
// example-helper.js

// pseudo code, which defines an API object similar to the one passed to the helper functions below
const api = {
    nodeContext, // fields extracted from a page root node
    options, // options passed to the plugin (in gatsby-config.js)
    gatsby, // the API received by the "createPages" function in gatsby-node.js

    // writes the content to a file (a file name is path.join("./data", slug, name))
    writeData (name, content) => string, 

    // generates a page from a lodash template, the "context" parameter is merged with "nodeContext" and is passed to the template
    generatePage (context) => void,

    // creates a page using the context parameter or nodeContext as a page context
    // the optional id is appended to to the page URI (could be useful if multiple pages are generated)
    createPage (context, {id}?) => void,    
}

// returns a query to use for the "content" entity
// the query may contain parameters from nodeContext, e.g., $id, $parent_re, etc
function query(api){
    return `
    query PageLayoutQuery($id: String) {
        mdx(id: { eq: $id }) {
            frontmatter {
                title,
                keywords,
                menu
            }    
        }  
    }
    `
}

// an asynchronous function to preprocess query results (the first function parameter).
// the object returned is merged with objects from other entities and further processed in the "combine" function
async function data(context, api){
    const frontmatter = context.mdx.frontmatter;
    // ...................
    return {frontmatter, layout};   
}

// an asynchronous function to further process merged entities (the "context" parameter)
async function combine(context, api){
    const layout = api.writeData("../layout.json", context.layout)
    api.generatePage({layout});
    api.createPage(context.frontmatter);    
}

module.exports = {
    entities : { // an object, describing distinct page parts (here just a single "content" entity)
        content:{ // the "content" of the page, an entity which groups query/data processing functionality
            scope: null, // "parent" | null; some page elements could be shared by many pages, e.g., a sidebar could be shared by all siblings, there is a single object per parent directory, hence the "parent" scope should be used
            query, // a function returning a GraphQL query
            data   // a function to asynchronously process query results
        }
    },
    combine // asynchronously processes all page entities
}
```


