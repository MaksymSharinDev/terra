import React, { useEffect } from 'react';
import { worldStore } from '../records';
import { useAsync, useAsyncRetry } from 'react-use';
import { Box, List, ListItem, Button, Stack, Spinner, Text, Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@chakra-ui/core';
import { LoadingOverlay } from './LoadingOverlay';
import dayjs from 'dayjs';
import { MenuContainer } from './MenuContainer';
import { Link } from 'react-router-dom';
import { FaTrash } from 'react-icons/fa';


const BreadcrumbLink$ = BreadcrumbLink as any;
const Button$ = Button as any;

export const NewGamePage = ({}) => {
  const worldSavesState = useAsyncRetry(async () => {
    return worldStore.getSaves()
  });
  console.log(worldSavesState);


  return (
    <MenuContainer>
      <Box pb="2" mb="5" borderBottom="1px" borderBottomColor="gray.600">
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbLink$ color="blue.200" as={Link} to="/">Main Menu</BreadcrumbLink$>
          </BreadcrumbItem>

          <BreadcrumbItem isCurrentPage>
            <BreadcrumbLink>Load World</BreadcrumbLink>
          </BreadcrumbItem>        
        </Breadcrumb>
      </Box>
      <Text fontSize="md">
        Load a saved world
      </Text>
      {worldSavesState.loading && <Spinner />}
      {worldSavesState.value && worldSavesState.value.length === 0 && (
        <Text fontSize="md" mt="5">
          <Box mb="5">
            There are no saved worlds. You must create a world before playing.
          </Box>

          <Button$ as={Link} to="/new-world" variantColor="blue" size="lg">
            New World
          </Button$>
        </Text>
      )}
      {worldSavesState.value && worldSavesState.value.length > 0 && (
        <Box
          mt="5"
          borderColor="gray.700"
          borderWidth="1px"
          rounded="lg"
          p="5"
        >
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>World Name</th>
                <th style={{ textAlign: 'left' }}>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {worldSavesState.value.map(item => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>
                    {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}
                  </td>
                  <td>
                    <Stack isInline spacing="2">
                      <Button size="sm" variant="ghost" variantColor="blue">
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        variantColor="red"
                        onClick={async () => {
                          await worldStore.removeSave(item.name);
                          worldSavesState.retry();
                        }}
                      >
                        <Box as={FaTrash} />
                      </Button>
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </MenuContainer>
  )
}