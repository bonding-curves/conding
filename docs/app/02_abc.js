importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.0/full/pyodide.js");

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
  const env_spec = ['https://cdn.holoviz.org/panel/1.0.4/dist/wheels/bokeh-3.1.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.0.4/dist/wheels/panel-1.0.4-py3-none-any.whl', 'pyodide-http==0.2.1', 'hvplot', 'numpy', 'pandas', 'param']
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


# # Augmented Bonding Curve
# 
# > $price = m*supply^n$ formula. Parameterized by $supply$, $price$, and $balance$.  
# > With an added entry and exit tribute

# In[2]:


#| default_exp pamm.abc


# In[3]:


#| export
import param as pm
import panel as pn
import pandas as pd
import numpy as np
import hvplot.pandas
# from conding.pamm.bancor import BondingCurve
pn.extension()


# In[4]:


#| export
class BondingCurve(pm.Parameterized):
    supply = pm.Number(80, softbounds=(1, 100), bounds=(1, None), step=1)
    price = pm.Number(2, softbounds=(0.01, 5), bounds=(0.01, None),  step=0.01)
    reserve_balance = pm.Number(40, softbounds=(10, 500), bounds=(1, None), step=1)
    marketcap = pm.Number(160, constant=True)
    reserve_ratio = pm.Number(0.25, constant=True, step=0.01)
    n = pm.Number(constant=True)
    m = pm.Number(constant=True)
    
    mint_amount = pm.Number(1, step=0.1)
    deposit = pm.Number(constant=True)
    mint_price = pm.Number(constant=True)
    new_price = pm.Number(constant=True)
    
    mint = pm.Action(lambda self: self._mint())
    
    def __init__(self, **params):
        super().__init__(**params)
        self.update()
    
    @pm.depends('reserve_balance', 'supply', 'price', 'mint_amount', watch=True)
    def update(self):
        with pm.edit_constant(self):
            self.marketcap = self.price * self.supply
            self.reserve_ratio = self.reserve_balance / self.marketcap
            self.param['mint_amount'].bounds = [-self.supply+1, None]
            self.n = ((1 / self.reserve_ratio) - 1)
            self.m = self.price / self.supply ** self.n
            if self.mint_amount == 0:
                self.deposit = 0
                self.mint_price = self.price
                self.new_price = self.price
            else:
                self.deposit = self.get_balance_deposit(self.mint_amount)
                self.mint_price = self.deposit / self.mint_amount
                self.new_price = self.get_price(self.supply+self.mint_amount)

    def get_price(self, supply):
        price = self.m * supply ** self.n
        return price
    
    def get_marketcap(self, supply):
        marketcap = self.get_price(supply) * supply
        return marketcap
    
    def get_reserve_balance(self, supply):
        reserve_balance = self.reserve_ratio * self.get_marketcap(supply)
        return reserve_balance
    
    # How much balance to deposit given a mint amount
    def get_balance_deposit(self, mint_amount):
        balance_deposit = self.get_reserve_balance(self.supply+mint_amount) - self.reserve_balance
        return balance_deposit
            
    # How much balance to return given a burn amount
    def get_balance_return(self, burn_amount):
        balance_return = self.reserve_balance - self.get_reserve_balance(self.supply-burn_amount)
        return balance_return
        
    # How much supply minted given a balance deposit
    def get_mint_amount(self, balance_deposit):
        mint_amount = self.supply * ((balance_deposit / self.get_reserve_balance(self.supply) + 1) ** (self.reserve_ratio) - 1)
        return mint_amount
    
    # How much supply to burn given a desired balance return
    def get_burn_amount(self, balance_return):
        return -self.get_mint_amount(-balance_return)
    
    def _mint(self):
        with pm.parameterized.discard_events(self):
            self.supply = self.supply + self.mint_amount
            self.reserve_balance = self.reserve_balance + self.deposit
            self.price = self.new_price
            self.mint_amount = 0
        self.param.trigger('supply', 'reserve_balance', 'price', 'mint_amount')
        
    def price_over_supply_curve(self):
        supply = np.linspace(*self.param['supply'].softbounds, num=1000)
        prices = self.get_price(supply)
        balance_slope = np.where(supply <= self.supply, prices, 0)
        marketcap_slope = np.where(supply <= self.supply, self.price, 0)
        future_supply = self.supply + self.mint_amount
        if future_supply > self.supply:
            balance_deposit = np.where((self.supply <= supply) & (supply <= future_supply), prices, 0)
        else:
            balance_deposit = np.where((future_supply <= supply) & (supply <= self.supply), prices, 0)
            
        new_price = np.where(supply <= future_supply, self.get_price(future_supply), 0)
        
        df = pd.DataFrame({
            'Supply': supply, 
            'Price': prices, 
            'Reserve Balance': balance_slope,
            'Marketcap': marketcap_slope,
            'Minting Deposit': balance_deposit,
            'New Price': new_price,
        })
        return df
    
    def view_price_over_supply_curve(self):
        price_over_supply_curve = self.price_over_supply_curve()
        price_curve = price_over_supply_curve.hvplot.line(x='Supply',y='Price')
        price_curve.opts( 
            color='purple', 
        )
        new_price = price_over_supply_curve.hvplot.area(x='Supply',y='New Price', y2='Marketcap')
        new_price.opts( 
            color='orange', 
            alpha=0.4,
        )
        balance_integral = price_over_supply_curve.hvplot.area(
            x='Supply', 
            y=['Marketcap', 'Reserve Balance', 'Minting Deposit'], 
            color=['green', 'blue', 'red'],
            alpha=0.4,
            stacked=False,
        )

        chart = price_curve * balance_integral * new_price
        return chart
    
    def view_points(self):
        current_price = (self.supply, self.price, 'Current Price')
        future_price = (self.supply+self.mint_amount, self.get_price(self.supply+self.mint_amount), 'Future Price')
        points = pd.DataFrame([future_price, current_price], columns=['x','y','label']).hvplot.scatter(
            x='x',
            y='y',
            by='label',
            color=['purple', 'orange'],
            size=80,) 
        return points
    
    @pm.depends('reserve_balance', 'supply', 'price', 'mint_amount')
    def view_chart(self):
        curve = self.view_price_over_supply_curve()
        points = self.view_points()
        chart = curve * points
        chart.opts(
            title="Bonding Curve Math",
            legend_position="top_right",
            xlim=self.param['supply'].softbounds,
            ylim=self.param['price'].softbounds,
            width=640,
            height=640,
        )
        return chart
    
    def view(self):
        return pn.Row(self, self.view_chart)


# In[5]:


#| export
class AugmentedBondingCurve(BondingCurve):
    entry_tribute = pm.Magnitude(0.22, step=0.01)
    exit_tribute  = pm.Magnitude(0.02, step=0.01)
    total_mint_deposit = pm.Number(constant=True)
    total_mint_price = pm.Number(constant=True)
    mint_tribute  = pm.Number(constant=True)
    common_pool   = pm.Number(0, constant=True, softbounds=(0,1000), bounds=(0, None))
    
    def __init__(self, **params):
        super().__init__(**params)
        self.update_deposit()
        self.set_bounds()
        
    def set_bounds(self):
        self.param['supply'].softbounds = (self.supply/2, self.supply*1.5)
        self.param['reserve_balance'].softbounds = (self.reserve_balance/2, self.reserve_balance*1.5)
        self.param['common_pool'].softbounds = (self.common_pool/2, self.common_pool*1.5+100)
        self.param['mint_amount'].step = 1
        self.param['mint_amount'].softbounds = (-self.supply/5, self.supply/5)
        # self.mint_amount = 1
        
    @pm.depends('entry_tribute', 'exit_tribute', 'deposit', watch=True)
    def update_deposit(self):
        with pm.edit_constant(self):
            if self.deposit > 0:
                self.total_mint_deposit = self.deposit / (1 - self.entry_tribute)
                self.total_mint_price = self.total_mint_deposit / self.mint_amount
                self.mint_tribute = self.total_mint_deposit - self.deposit
            elif self.deposit < 0:
                self.total_mint_deposit = self.deposit - self.deposit * self.exit_tribute
                self.total_mint_price = self.total_mint_deposit / self.mint_amount
                self.mint_tribute = self.total_mint_deposit - self.deposit
            else:
                self.total_mint_deposit = self.deposit
                self.total_mint_price = self.mint_price
                self.mint_tribute = 0
                
    def _mint(self):
        with pm.edit_constant(self):
            self.common_pool += self.mint_tribute
        super()._mint()
        
    def total_price_curve(self):
        supply = np.linspace(self.param['supply'].softbounds[0],self.param['supply'].softbounds[1]-1, num=1000)
        mint_amount = supply - self.supply
        deposit = self.get_balance_deposit(mint_amount)
        mint_total_price = deposit / (1 - self.entry_tribute) / mint_amount
        burn_total_price = (deposit - deposit * self.exit_tribute) / mint_amount
        total_price = np.where(supply > self.supply, mint_total_price, burn_total_price)
        df = pd.DataFrame({
            'Supply': supply, 
            'Total Mint Price': total_price, 
        })
        return df
    
    def view_total_price_curve(self):
        total_price_curve = self.total_price_curve()
        chart = total_price_curve.hvplot.line(
            x='Supply',
            y='Total Mint Price',
            color='brown', 
            label='Mint Price with Tribute',
            line_dash='dashed',
        )
        mint_price = (self.supply+self.mint_amount, self.total_mint_price, 'Mint Price With Tribute')
        points = pd.DataFrame([mint_price], columns=['x','y','label']).hvplot.scatter(
            x='x',
            y='y',
            by='label',
            color=['brown'],
            size=80,) 
        return chart * points
    
    @pm.depends('reserve_balance', 'supply', 'price', 'mint_amount', 'entry_tribute', 'exit_tribute')
    def view_chart(self):
        curve = self.view_price_over_supply_curve()
        points = self.view_points()
        total_price_curve = self.view_total_price_curve()
        chart = curve * total_price_curve * points
        chart.opts(
            title="Bonding Curve Math",
            legend_position="top_right",
            xlim=self.param['supply'].softbounds,
            ylim=self.param['price'].softbounds,
            width=640,
            height=640,
        )
        return chart


# In[6]:


params = {'price': 0.5819617554632301,
 'supply': 1744563.5546850923,
 'reserve_balance': 201224.77119859183,
 'entry_tribute': 0.02,
 'exit_tribute': 0.12,
 'common_pool': 394702.56437878497}

abc = AugmentedBondingCurve(**params)

abc.param['supply'].softbounds = (abc.param['supply'].softbounds[0], abc.param['supply'].softbounds[1]*2)
abc.param['price'].softbounds = (0,10)
abc.param['mint_amount'].softbounds = (abc.param['mint_amount'].softbounds[0], abc.param['mint_amount'].softbounds[1]*5)
abc.param['mint_amount'].step = 1000
abc.mint_amount = 1482087


# In[7]:


abc.view().servable()


# In[25]:


# import time

# num = 10
# mints = np.random.randn(num)
# for m in mints:
#     b.mint_amount = m
#     time.sleep(0.2)
#     b._mint()


# In[38]:


# #| hide
# import nbdev; nbdev.nbdev_export()


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
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()