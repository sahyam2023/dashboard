import{O as l,j as o}from"./index-Cu8pFRnJ.js";import{a as i}from"./CommentSection-CX-ZF29H.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=l("ExternalLink",[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]),h=({software:e,selectedSoftwareId:r,onSelectFilter:a})=>o.jsx("div",{className:"mb-6 border-b border-gray-200",children:o.jsxs("div",{className:"flex flex-wrap items-center -mb-px",children:[o.jsx("button",{onClick:()=>a(null),className:`
            mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
            ${r===null?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
          `,children:"All"}),e.map(t=>o.jsx("button",{onClick:()=>a(t.id),className:`
              mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
              ${r===t.id?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
            `,children:t.name},t.id))]})}),c=/^((http|https):\/\/)?((www\.)?)(localhost|([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+))(:[0-9]+)?(\/[^\s]*)?$/,x=()=>i().test({name:"isValidUrl",message:'Please enter a valid URL. Examples: https://www.google.com, example.com/path. Ensure there are no spaces and the domain is correct (e.g., no "www.com", "http://.com").',test:e=>{if(!e)return!0;const r=e.toLowerCase(),a=/^(?:(?:http|https):?\/\/)?www\.([a-zA-Z0-9]+)$/,t=r.match(a);if(t){const s=t[1];if(s.length>0&&s.length<=4&&/^[a-z0-9]+$/.test(s)&&!s.includes(".")){const n=r.replace(/^(?:(?:http|https):?\/\/)?/,"").split(".");if(n.length===2&&n[0]==="www")return!1}}return c.test(e)}});export{p as E,h as F,x as y};
