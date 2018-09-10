# RDA Service Registry Client

The RDA registry client provides facilities for registering & looking up services
at the RDA service registry.


# API

***Registering as service***

The client can be used to register as a service that can be consumed by other 
services.

```javascript
import ServiceRegistryClient from '@infect/rda-service-registry-client';

// pass the service registry host to the client
const client = new ServiceRegistryClient('http://l.dns.porn:8000');

// register the service
await client.register({
    serviceName: 'test-service',
    port: 7891,
});

// de-register again
await client.deregister();
```

***Looking up a service***

The client can be used to lookup where to find other services. If one service 
was registered multiple times at the registry a random one will be returned.

```javascript
import ServiceRegistryClient from '@infect/rda-service-registry-client';

// pass the service registry host to the client
const client = new ServiceRegistryClient('http://l.dns.porn:8000');

// get the address of one random serviceName service instance
const url = await client.lookup(serviceName);
```


### Constructor

The registry client the address under which the registry service is reachable.
Thats the only parameter that needs to be passed to it. 

Attention: if you are registering yourself as service you _must_ only use one
instance of the registry client since it creates a identifier by which it is 
later identified. If you wish to use multiple instances you need to pass the 
identifier to to the register method each time it is used.


```javascript
const client = new ServiceRegistryClient('http://l.dns.porn:8000');
```



### client.register()

Register your service on the registry service so that it can be consumed by 
other services. This method should only be called once per service on one client
instance (see the warning in the Constructor documentation).

Parameters:
- serviceName: the name of your service
- port: the port your service is listening on
- identifier: optional: a unique identifier for your instance of the service 
- protocol: the protocol used to contact your service. defaults to http://

```javascript
await client.register({
    serviceName: 'test-service',
    port: 7891,
    identifer: myidentifier,
    protocol: 'http://'
});
```



### client.deregister()

De-register your service so that other services will not try to contact it again.


```javascript
await client.deregister();
```


### client.resolve()

Look up the address of another service. If multiple instances of the other 
service are available the address of a random one will be returned.

```javascript
const url = await client.lookup(serviceName);
```