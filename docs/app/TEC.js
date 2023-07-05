importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'conding', 'millify', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[1]:


#| hide
('load_ext', 'autoreload')
('autoreload', '2')


# # TEC Price Analysis
# 
# > TEC Price Projections

# In[93]:


from conding.pamm.abc import AugmentedBondingCurve
from conding.dune.tec import TECDashboard
import pandas as pd
# from icecream import ic
from millify import millify
import panel as pn
# ic.configureOutput(outputFunction=print, prefix='', argToStringFunction=lambda x: millify(x, precision=2))
tec = TECDashboard()


# In[11]:


update_cache = False

supply = tec.market_information.supply(update_cache=update_cache)
reserve_balance = tec.reserves.reserve_pool_value(update_cache=update_cache)
common_pool = tec.reserves.common_pool_value(update_cache=update_cache)
price = tec.trades.abc_token_sales(update_cache=update_cache).iloc[0]['price_per_token']

entry_tribute = 0.02
exit_tribute  = 0.12


# In[43]:


abc = AugmentedBondingCurve(
    price=price, 
    supply=supply, 
    reserve_balance=reserve_balance, 
    entry_tribute=entry_tribute, 
    exit_tribute=exit_tribute, 
    common_pool=common_pool
)

abc.param['supply'].softbounds = (abc.param['supply'].softbounds[0], abc.param['supply'].softbounds[1]*2)
abc.param['price'].softbounds = (0,10)
abc.param['mint_amount'].softbounds = (abc.param['mint_amount'].softbounds[0], abc.param['mint_amount'].softbounds[1]*5)
abc.param['mint_amount'].step = 1000
abc.mint_amount = 1482087


# In[99]:


# pn.Column(
#     ic.format(abc.mint_amount),
#     ic.format(abc.total_mint_deposit), 
#     ic.format(abc.total_mint_price),
#     ic.format(abc.mint_tribute),
# )


# In[101]:


abc.view().servable()


# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()