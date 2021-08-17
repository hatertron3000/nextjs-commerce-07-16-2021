import type { CheckoutEndpoint } from '.'
import getCustomerId from '../../utils/get-customer-id'
import jwt from 'jsonwebtoken'
import { uuid } from 'uuidv4'

const fullCheckout = process.env.FULL_CHECKOUT
console.log(fullCheckout)

const checkout: CheckoutEndpoint['handlers']['checkout'] = async ({
  req,
  res,
  config,
}) => {
  const { cookies } = req
  const cartId = cookies[config.cartCookie]
  const customerToken = cookies[config.customerCookie]
  if (!cartId) {
    res.redirect('/cart')
    return
  }
  const { data } = await config.storeApiFetch(
    `/v3/carts/${cartId}/redirect_urls`,
    {
      method: 'POST',
    }
  )
  const customerId =
    customerToken && (await getCustomerId({ customerToken, config }))

  let checkoutUrl

  //if there is a customer create a jwt token
  // note getCustomerId will return "undefined" as a string if shopper has logged out on checkout but not Next
  if (!customerId || customerId === "undefined") {
    if (fullCheckout) {
      res.redirect(data.checkout_url)
      return
    }
    checkoutUrl = data.embedded_checkout_url
  } else {
    const dateCreated = Math.round(new Date().getTime() / 1000)
    const payload = {
      iss: config.storeApiClientId,
      iat: dateCreated,
      jti: uuid(),
      operation: 'customer_login',
      store_hash: config.storeHash,
      customer_id: customerId,
      channel_id: config.storeChannelId,
      redirect_to: fullCheckout ? data.checkout_url : data.embedded_checkout_url,
    }
    let token = jwt.sign(payload, config.storeApiClientSecret!, {
      algorithm: 'HS256',
    })
    checkoutUrl = `${config.storeUrl}/login/token/${token}`
    if (fullCheckout) {
      res.redirect(checkoutUrl)
      return
    }
  }

  // TODO: make the embedded checkout work too!
  const html = `
       <!DOCTYPE html>
         <html lang="en">
         <head>
           <meta charset="UTF-8">
           <meta name="viewport" content="width=device-width, initial-scale=1.0">
           <title>Checkout</title>
           <script src="https://checkout-sdk.bigcommerce.com/v1/loader.js"></script>
           <script>
             window.onload = function() {
               checkoutKitLoader.load('checkout-sdk').then(function (service) {
                 service.embedCheckout({
                   containerId: 'checkout',
                   url: '${checkoutUrl}'
                 });
               });
             }
           </script>
         </head>
         <body>
           <div id="checkout"></div>
         </body>
       </html>
     `

  res.status(200)
  res.setHeader('Content-Type', 'text/html')
  res.write(html)
  res.end()
}

export default checkout